import * as Phaser from 'phaser';
import {
  DEFAULT_WEAPON,
  DIRECTION_DELTAS,
  angleOfVector,
  getAggro,
  getWeapon,
  isMoving,
  parseVfxRef,
  snapAngleToDirection,
  tickMs,
  type CombatEvent,
  type CombatStats,
  type Direction,
  type GameRules,
  type MobState,
  type MoveIntent,
  type PlayerPrivateState,
  type PlayerState,
  type ServerMessage,
  type Skill,
  type SnapshotMessage,
  type StepOutcome,
  type Walkability,
  type WeaponDefinition,
  type ZoneSnapshot,
} from '@thistlevane/shared';
import { TargetingController } from '../combat/TargetingController';
import { findCharacter, findMob, keys, type ClientContent, type SpriteRef } from '../content/ContentLoader';
import { EntitySprite } from '../entities/EntitySprite';
import { ClickToMoveController } from '../input/ClickToMoveController';
import { InputController } from '../input/InputController';
import { LocalPlayerPredictor } from '../net/LocalPlayerPredictor';
import { NetClient } from '../net/NetClient';
import { RemotePlayerBuffer } from '../net/RemotePlayerBuffer';
import { ServerClock } from '../net/ServerClock';
import { CombatTextManager } from '../ui/CombatText';
import { GameHud } from '../ui/GameHud';
import { MapGuide } from '../ui/MapGuide';
import { Minimap } from '../ui/Minimap';
import { DebugOverlay, type DebugMobInfo } from '../world/DebugOverlay';
import { EffectsManager } from '../world/EffectsManager';
import { MapView } from '../world/MapView';

const EMPTY_PRIVATE_STATE: PlayerPrivateState = { xp: 0, xpForLevel: 1, resourceCurrent: 0, resourceMax: 0, cooldownsMs: {} };
/** These 3 archetypes hold for as long as a buff/stance/channel is active, but this engine has
 * no status-effect/duration system to tell the VFX when that ends (see the integration notes) —
 * so they're given this fixed, reasonable hold time instead of looping forever. */
const LOOPING_VFX_FALLBACK_MS = 1800;

interface RemoteEntity {
  sprite: EntitySprite;
  buffer: RemotePlayerBuffer;
  /** Mob kind id (mobs only) — the key into mobs.json. */
  kind?: string;
  /** Latest known hp from snapshots (not interpolated — just the latest value, like a player's). */
  hp: number;
  /** Mobs only: latest AI state name, for the dev read-out / debug overlay. */
  aiState?: string;
}

/** Phaser key names for the hotbar digits, in slot order. */
const DIGIT_KEYS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'];

/** Everything tied to the zone we are currently standing in. Rebuilt on every zone change. */
interface Session {
  zoneId: string;
  map: MapView;
  predictor: LocalPlayerPredictor;
  sprite: EntitySprite;
  remotes: Map<string, RemoteEntity>;
  mobs: Map<string, RemoteEntity>;
  infos: Map<string, { name: string; characterId: string }>;
  /** Local player's hp sign as of the last snapshot — lets onSnapshot detect the 0→positive
   * transition (revive) without a dedicated server event for it. */
  wasAlive: boolean;
}

/**
 * The game world: renders the zone the server put us in, runs the local
 * fixed-tick prediction loop, draws remote players and mobs interpolated
 * from server snapshots, and renders the server-authoritative combat events
 * (attacks, hits, deaths, aggro, windups, projectiles) broadcast alongside
 * them. All tuning comes from loaded content + server rules.
 */
export class WorldScene extends Phaser.Scene {
  private content!: ClientContent;
  private net!: NetClient;
  private controls!: InputController;
  private hud!: GameHud;
  private mapGuide!: MapGuide;
  private minimap!: Minimap;
  private effects!: EffectsManager;
  private combatText!: CombatTextManager;
  private debugOverlay: DebugOverlay | null = null;
  private readonly clickToMove = new ClickToMoveController();
  /** Server-authoritative xp/resource/cooldowns for the local player only — never broadcast to
   * other clients (see shared/src/protocol.ts PlayerPrivateState). */
  private you: PlayerPrivateState = EMPTY_PRIVATE_STATE;
  /** classId of the local player's character, or null for a grid (no-class) character. */
  private myClassId: string | null = null;
  private destinationMarker: Phaser.GameObjects.Graphics | null = null;
  private targetRing: Phaser.GameObjects.Image | null = null;
  private zoom = 1;

  private myId: string | null = null;
  private rules: GameRules | null = null;
  private clock: ServerClock | null = null;
  private tickLength = 50;
  private session: Session | null = null;
  private loadingZone: string | null = null;
  private accumulator = 0;
  private lastFrameAt: number | null = null;

  // Combat: aim is independent of movement facing, driven by the mouse.
  private aimDirection: Direction = 'down';
  /** Real, continuous aim angle (degrees) behind aimDirection — sent with skill casts so
   * targeting is free-aim, not snapped to one of 8 directions (movement stays tile-based). */
  private aimDegrees = 90;
  private mouseWorldTile = { x: 0, y: 0 };
  private myWeapon: WeaponDefinition = DEFAULT_WEAPON;
  private myCombat: CombatStats = { maxHp: 100, maxMp: 50, attack: 10, defense: 5 };
  private myFrameHeight = 96;
  private attackSeq = 0;
  /** Client-side mirror only (drives the hotbar sweep); the server independently re-validates. */
  private lastAttackAt = -Infinity;
  private castSeq = 0;
  /** Client-side mirror only, keyed by skillId (drives responsiveness before the server's own
   * you.cooldownsMs arrives); the server independently re-validates every cast. */
  private readonly lastCastAt = new Map<string, number>();
  private readonly targeting = new TargetingController();
  /** Looping VFX (passive_aura/channel_pulse/buff_aura) spawned by a cast, torn down after
   * LOOPING_VFX_FALLBACK_MS — tracked only so a stale one can't outlive its sprite's destroy(). */
  private readonly activeLoopingVfx = new Set<Phaser.GameObjects.Sprite>();

  constructor() {
    super('world');
  }

  init(content: ClientContent): void {
    this.content = content;
  }

  create(): void {
    const { config } = this.content;
    this.cameras.main.setBackgroundColor(config.client.backgroundColor);
    this.applyIntegerZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.applyIntegerZoom());

    this.hud = new GameHud(document.getElementById('game-ui')!, this.content, import.meta.env.DEV);
    this.mapGuide = new MapGuide(document.getElementById('game-ui')!, this.content);
    this.minimap = new Minimap(document.getElementById('game-ui')!);
    this.controls = new InputController(config.client.controls);
    this.controls.onAttackPressed = () => this.useSkill(this.hud.skillAt(0)?.id ?? null);
    this.controls.onMapGuidePressed = () => this.mapGuide.toggle();
    this.effects = new EffectsManager(this, this.content.effects);
    this.combatText = new CombatTextManager(this);
    this.debugOverlay = import.meta.env.DEV ? new DebugOverlay(this) : null;

    this.hud.onSkillSlotActivated = (skillId) => this.useSkill(skillId);
    this.bindCombatKeys();
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer));
    // Primary movement: left-click empty, walkable ground to walk there. Clicking a mob/player
    // sprite instead hits that object's own interactive area (targeting) — `currentlyOver`
    // tells us which happened, so a click never does both.
    this.input.on(
      Phaser.Input.Events.POINTER_DOWN,
      (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
        if (pointer.leftButtonDown() && currentlyOver.length === 0) this.onClickGround(pointer);
      },
    );

    this.net = new NetClient(NetClient.defaultUrl(config.network.wsPath));
    this.net.onStatusChange = (status) => {
      if (status === 'open') this.net.send({ type: 'join', ...this.chooseIdentity() });
      this.hud.setStatus(status);
    };
    this.net.onMessage = (msg) => this.handleMessage(msg);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.net.close();
      this.controls.destroy();
      this.debugOverlay?.destroy();
    });
  }

  override update(): void {
    // Wall-clock frame time. Phaser's `delta` is smoothed, which would let the
    // local simulation drift slower than the server's real-time tick rate.
    const now = performance.now();
    const elapsed = this.lastFrameAt === null ? 0 : now - this.lastFrameAt;
    this.lastFrameAt = now;

    const s = this.session;
    if (!s || !this.clock) return;

    // Fixed-timestep local simulation, matching the server's tick length. Dead players don't move.
    this.accumulator += Math.min(elapsed, this.content.config.client.maxFrameMs);
    const alive = s.predictor.current.hp > 0;
    while (this.accumulator >= this.tickLength) {
      if (alive) {
        this.onLocalOutcome(s.predictor.tick(this.resolveMoveIntent()));
        const current = s.predictor.current;
        if (this.clickToMove.afterTick(current.tileX, current.tileY, current.moveTicksLeft)) this.replanClickToMove(s);
      }
      this.accumulator -= this.tickLength;
    }
    const pos = s.predictor.renderPosition(this.accumulator / this.tickLength);
    const me = s.predictor.current;
    s.sprite.update(pos.x, pos.y, me.facing, alive && isMoving(me), me.gait);
    this.hud.setDowned(!alive);

    const otherPlayerPositions: Array<{ x: number; y: number }> = [];
    const serverNow = this.clock.serverNow();
    if (serverNow !== null) {
      const renderTime = serverNow - this.content.config.client.interpolationDelayMs;
      for (const group of [s.remotes, s.mobs]) {
        for (const remote of group.values()) {
          const pose = remote.buffer.sample(renderTime);
          if (pose) {
            remote.sprite.update(pose.x, pose.y, pose.facing, pose.moving, pose.gait);
            if (group === s.remotes) otherPlayerPositions.push({ x: pose.x, y: pose.y });
          }
        }
      }
    }

    s.map.update(now);
    this.updateHoverCombat(s);
    this.updateCombatUi();
    this.updateDebugOverlay(s, pos);
    this.minimap.update(pos.x, pos.y, otherPlayerPositions);
    if (import.meta.env.DEV) {
      this.hud.update({
        zone: this.content.zones.zones[s.zoneId]?.name ?? s.zoneId,
        tile: `${me.tileX},${me.tileY} L${s.map.model.levelAt(me.tileX, me.tileY)}`,
        playerCount: s.remotes.size + 1,
        mobCount: s.mobs.size,
        corrections: s.predictor.corrections,
        pendingInputs: s.predictor.pendingCount,
        gait: me.gait,
        mouseTile: `${this.mouseWorldTile.x.toFixed(1)},${this.mouseWorldTile.y.toFixed(1)}`,
        aim: this.aimDirection,
        nearestMob: this.nearestMobDebugLabel(s),
      });
    }
  }

  // ---------- networking ----------

  private handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'welcome':
        this.myId = msg.yourId;
        this.rules = msg.rules;
        this.tickLength = tickMs(msg.rules);
        this.clock = new ServerClock(this.tickLength);
        this.you = msg.you;
        this.enterZone(msg);
        return;
      case 'zoneChange':
        this.you = msg.you;
        this.enterZone(msg);
        return;
      case 'playerJoined':
        this.session?.infos.set(msg.player.id, { name: msg.player.name, characterId: msg.player.characterId });
        return;
      case 'playerLeft':
        if (this.session) this.removeRemote(this.session, msg.id);
        return;
      case 'snapshot':
        return this.onSnapshot(msg);
      case 'error':
        console.error('[net] server error:', msg.reason);
        return;
    }
  }

  /** Tear down the current zone (if any) and build the one the server describes. */
  private enterZone(zone: ZoneSnapshot): void {
    if (!this.myId || !this.rules) return;
    const myId = this.myId, rules = this.rules;
    this.disposeSession();
    this.loadingZone = zone.zoneId;
    this.hud.setLoading(this.content.zones.zones[zone.zoneId]?.name ?? zone.zoneId);

    MapView.load(this, this.content, zone.zoneId, this.effects)
      .then((map) => {
        if (this.loadingZone !== zone.zoneId) return; // superseded by another zone change
        const me = zone.states.find((s) => s.id === myId);
        if (!me) throw new Error('Zone data did not include our own state');
        const infos = new Map(zone.players.map((p) => [p.id, { name: p.name, characterId: p.characterId }]));
        const others = zone.states.filter((s) => s.id !== myId);
        const predictor = new LocalPlayerPredictor(me, map.model, rules.movement, (input) => this.net.send(input));
        predictor.reconcile(me, 0, [...others, ...zone.mobs.map(mobAsMover)]);

        const session: Session = {
          zoneId: zone.zoneId, map, predictor, sprite: null as unknown as EntitySprite,
          remotes: new Map(), mobs: new Map(), infos, wasAlive: me.hp > 0,
        };
        session.sprite = this.createCharacter(session, myId, true);
        this.session = session;
        this.accumulator = 0;
        this.loadingZone = null;
        this.mapGuide.setCurrentZone(zone.zoneId);
        this.mapGuide.recordPortals(zone.zoneId, map.model.portals);
        this.minimap.setZone(map.model);

        const lerp = this.content.config.client.cameraLerp;
        const start = predictor.renderPosition(0);
        this.cameras.main.centerOn((start.x + 0.5) * map.tileSize.width, (start.y + 0.5) * map.tileSize.height);
        this.cameras.main.startFollow(session.sprite.sprite, true, lerp, lerp);
        map.update(performance.now());
        this.hud.setLoading('');
        const info = infos.get(myId);
        const characterId = info?.characterId ?? '';
        const def = findCharacter(this.content, characterId);
        const stats = def.combat ?? { maxHp: 100, maxMp: 50, attack: 10, defense: 5 };
        this.myCombat = stats;
        this.myWeapon = getWeapon(def);
        this.myFrameHeight = def.frameHeight;
        this.myClassId = this.hud.classIdFor(characterId);
        this.hud.setPlayer(info?.name ?? '?', characterId, me.level, stats);
        this.hud.setSkills(this.content.skills, this.myClassId, me.level);
        this.hud.updatePlayerHp(me.hp, stats.maxHp);
        this.hud.updateXp(this.you.xp, this.you.xpForLevel, me.level);
        this.hud.setDowned(me.hp <= 0);
        this.targeting.clear();
        this.hud.clearTarget();
        this.targetRing?.setVisible(false);
      })
      .catch((err: Error) => {
        console.error('[world]', err);
        this.hud.setError(err.message);
      });
  }

  private disposeSession(): void {
    const s = this.session;
    if (!s) return;
    this.session = null;
    this.targeting.clear();
    this.targetRing?.setVisible(false);
    this.hud.clearTarget();
    this.clickToMove.clear();
    this.destinationMarker?.destroy();
    this.destinationMarker = null;
    this.cameras.main.stopFollow();
    s.sprite.destroy();
    for (const r of s.remotes.values()) r.sprite.destroy();
    for (const m of s.mobs.values()) m.sprite.destroy();
    s.map.destroy();
  }

  private onSnapshot(msg: SnapshotMessage): void {
    const s = this.session;
    if (!s || !this.clock || !this.myId) return; // still loading a zone
    this.clock.observe(msg.tick);
    const serverTime = this.clock.serverTimeOfTick(msg.tick);
    this.you = msg.you;

    let mine: PlayerState | null = null;
    const others: PlayerState[] = [];
    for (const state of msg.players) {
      if (state.id === this.myId) mine = state;
      else others.push(state);
    }
    if (!mine) return; // snapshot from the zone we just left
    const aliveNow = mine.hp > 0;
    if (!s.wasAlive && aliveNow) {
      s.sprite.revive();
      this.hud.setDowned(false);
    }
    s.wasAlive = aliveNow;
    s.predictor.reconcile(mine, msg.ackSeq, [...others, ...msg.mobs.map(mobAsMover)]);

    const seenPlayers = new Set<string>();
    for (const state of others) {
      seenPlayers.add(state.id);
      let remote = s.remotes.get(state.id);
      if (!remote) {
        remote = { sprite: this.createCharacter(s, state.id, false), buffer: new RemotePlayerBuffer(), hp: state.hp };
        s.remotes.set(state.id, remote);
        // A late joiner must see an already-dead remote player correctly, not standing normally.
        if (state.hp <= 0) remote.sprite.request('dead', 'death', remote.sprite.facing);
      } else if (remote.hp <= 0 && state.hp > 0) {
        remote.sprite.revive();
      }
      remote.hp = state.hp;
      remote.buffer.push(serverTime, state);
    }
    for (const id of s.remotes.keys()) if (!seenPlayers.has(id)) this.removeRemote(s, id);

    const seenMobs = new Set<string>();
    for (const mob of msg.mobs) {
      seenMobs.add(mob.id);
      let remote = s.mobs.get(mob.id);
      if (!remote) {
        const ref = findMob(this.content, mob.kind);
        if (!ref) continue;
        remote = { sprite: this.createEntity(s, ref, null), buffer: new RemotePlayerBuffer(), kind: mob.kind, hp: mob.hp, aiState: mob.aiState };
        const mobId = mob.id;
        remote.sprite.sprite.setInteractive({ useHandCursor: true });
        remote.sprite.sprite.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.lockTarget(mobId));
        remote.sprite.sprite.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.targeting.setHover(mobId));
        remote.sprite.sprite.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
          if (this.targeting.hoveredTargetId === mobId) this.targeting.setHover(null);
        });
        // A late joiner must see an already-damaged/defeated mob correctly, not at full health.
        const maxHp = this.content.mobs.mobs[mob.kind]?.combat?.maxHp ?? mob.hp;
        if (mob.hp <= 0) remote.sprite.request('dead', 'death', remote.sprite.facing);
        else if (mob.hp < maxHp) remote.sprite.setHealth(mob.hp, maxHp);
        s.mobs.set(mob.id, remote);
      } else if (remote.hp <= 0 && mob.hp > 0) {
        // Respawned: the server resets hp without a dedicated event; detect the transition here.
        remote.sprite.revive();
      }
      remote.hp = mob.hp;
      remote.aiState = mob.aiState;
      remote.buffer.push(serverTime, { ...mob, gait: 'walk', turnTicksLeft: 0, level: 1 });
    }
    for (const [id, m] of s.mobs) {
      if (seenMobs.has(id)) continue;
      m.sprite.destroy();
      s.mobs.delete(id);
      this.forgetTarget(id); // out of range, or dead and hidden until it respawns
    }

    for (const event of msg.events) this.handleCombatEvent(s, event);
  }

  // ---------- entities & effects ----------

  private createCharacter(s: Session, id: string, isLocal: boolean): EntitySprite {
    const info = s.infos.get(id);
    const def = findCharacter(this.content, info?.characterId ?? '');
    const style = this.content.config.client.nameLabel;
    const ref: SpriteRef = { kind: 'character', id: def.id, def };
    const sprite = this.createEntity(s, ref, { text: info?.name ?? id, color: isLocal ? style.localColor : style.color });
    sprite.onEnterTile = (tile, from, gait) => {
      const now = performance.now();
      s.map.onPlayerEnteredTile(tile.x, tile.y, now);
      const stepFx = gait === 'run' ? def.effects?.runStep : def.effects?.walkStep;
      const [fx, fy] = s.map.tileFoot(from.x, from.y);
      this.effects.play(stepFx, fx, fy - s.map.tileSize.height * 0.25, fy);
    };
    return sprite;
  }

  private createEntity(s: Session, ref: SpriteRef, label: { text: string; color: string } | null): EntitySprite {
    return new EntitySprite(this, ref, s.map.tileSize, label, this.content.config.client.nameLabel, this.zoom);
  }

  private onLocalOutcome(outcome: StepOutcome): void {
    if (outcome.kind === 'blocked' && this.session) {
      this.session.map.onPlayerBumped(outcome.tileX, outcome.tileY, performance.now());
    }
  }

  private removeRemote(s: Session, id: string): void {
    s.remotes.get(id)?.sprite.destroy();
    s.remotes.delete(id);
    s.infos.delete(id);
  }

  // ---------- mouse aim ----------

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const s = this.session;
    if (!s) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const foot = s.sprite.footPosition;
    const dx = world.x - foot.x, dy = world.y - foot.y;
    this.aimDirection = snapAngleToDirection(dx, dy);
    this.aimDegrees = angleOfVector(dx, dy);
    this.mouseWorldTile = { x: world.x / s.map.tileSize.width, y: world.y / s.map.tileSize.height };
  }

  // ---------- click-to-move ----------

  /** Left-click on open ground: plans a route there, replacing whatever path was active. */
  private onClickGround(pointer: Phaser.Input.Pointer): void {
    const s = this.session;
    if (!s) return;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tile = { x: Math.floor(world.x / s.map.tileSize.width), y: Math.floor(world.y / s.map.tileSize.height) };
    const from = { x: s.predictor.current.tileX, y: s.predictor.current.tileY };
    if (this.clickToMove.moveTo(from, tile, this.buildDynamicWorld(s))) this.showDestinationMarker(tile, s);
  }

  /** Held keyboard movement always wins and cancels any active route; click-to-move is the
   * default driver otherwise, so pressing a key never has to fight an autopiloted path. */
  private resolveMoveIntent(): MoveIntent {
    const keyboard = this.controls.intent;
    if (keyboard.dir !== null) {
      this.clickToMove.clear();
      return keyboard;
    }
    const dir = this.clickToMove.currentDirection;
    return dir !== null ? { dir, run: this.controls.isRunHeld } : { dir: null, run: false };
  }

  private replanClickToMove(s: Session): void {
    const dest = this.clickToMove.destinationTile;
    const owner = this.clickToMove.currentOwner;
    if (!dest || !owner) return;
    const from = { x: s.predictor.current.tileX, y: s.predictor.current.tileY };
    this.clickToMove.moveTo(from, dest, this.buildDynamicWorld(s), owner);
  }

  /** The static map plus every currently-known living mob/remote-player tile as a soft
   * obstacle — click-to-move reuses the exact `Walkability` contract `stepMovement` itself
   * consumes, so a planned route is never stricter or looser than what the server will accept. */
  private buildDynamicWorld(s: Session): Walkability {
    const blocked = new Set<string>();
    for (const m of s.mobs.values()) if (m.hp > 0 && m.sprite.visualTile) blocked.add(`${m.sprite.visualTile.x},${m.sprite.visualTile.y}`);
    for (const r of s.remotes.values()) if (r.hp > 0 && r.sprite.visualTile) blocked.add(`${r.sprite.visualTile.x},${r.sprite.visualTile.y}`);
    const map = s.map.model;
    return { isWalkable: (x, y, fromX, fromY) => map.isWalkable(x, y, fromX, fromY) && !blocked.has(`${x},${y}`) };
  }

  /** Small, brief, non-circular destination mark — just enough feedback to show where a click landed. */
  private showDestinationMarker(tile: { x: number; y: number }, s: Session): void {
    this.destinationMarker?.destroy();
    const [fx, fy] = s.map.tileFoot(tile.x, tile.y);
    const g = this.add.graphics({ x: fx, y: fy }).setDepth(fy - 0.2);
    const r = 5;
    g.lineStyle(1, 0xf0e6c8, 0.9);
    g.beginPath();
    g.moveTo(0, -r);
    g.lineTo(r, 0);
    g.lineTo(0, r);
    g.lineTo(-r, 0);
    g.closePath();
    g.strokePath();
    this.destinationMarker = g;
    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 450,
      delay: 150,
      onComplete: () => {
        g.destroy();
        if (this.destinationMarker === g) this.destinationMarker = null;
      },
    });
  }

  // ---------- combat input ----------

  private bindCombatKeys(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    // Tab would move browser focus out of the canvas, so the scene claims it.
    kb.addCapture(['TAB', 'ESC']);
    kb.on('keydown-TAB', () => this.cycleTarget());
    kb.on('keydown-ESC', () => {
      if (this.mapGuide.isOpen) this.mapGuide.close();
      else this.lockTarget(null);
    });
    DIGIT_KEYS.forEach((key, i) => {
      kb.on(`keydown-${key}`, () => {
        const skill = this.hud.skillAt(i);
        if (skill !== undefined) this.useSkill(skill?.id ?? null);
      });
    });
  }

  /** `skillId === null` is the no-class "Strike" fallback (the old generic basic attack);
   * anything else is cast through the real skill system. */
  private useSkill(skillId: string | null): void {
    const s = this.session;
    if (!s) return;
    if (skillId === null) {
      this.attemptAttack(this.targeting.effectiveTargetId ?? undefined);
      return;
    }
    this.castSkill(skillId, this.targeting.effectiveTargetId ?? undefined);
  }

  /**
   * Basic attack attempt. Sends it to the server (which alone decides cooldown/range/damage),
   * and optimistically plays the local swing right away for responsiveness — the same cosmetic
   * path a remote player's broadcast 'attack' event uses. With a live `targetId`, the server
   * recomputes the swing's real direction from the target's position (see World.resolveAttackAim)
   * instead of trusting `aim`, so this lands regardless of which way the mouse happens to be
   * pointed — `aim` is sent only as the untargeted fallback.
   */
  private attemptAttack(targetId?: string): void {
    const s = this.session;
    if (!s || !this.myId) return;
    if (s.predictor.current.hp <= 0) return; // dead: no attacking
    const now = performance.now();
    const cooldownMs = this.myWeapon.cooldownTicks * this.tickLength;
    if (now - this.lastAttackAt < cooldownMs) return; // client-side mirror only; server re-validates
    this.lastAttackAt = now;
    this.attackSeq += 1;
    this.net.send({ type: 'attack', seq: this.attackSeq, aim: this.aimDirection, targetId });
    this.hud.flashSkill(null);
    this.onAttackEvent(s, { kind: 'attack', sourceId: this.myId, aim: this.aimDirection });
  }

  /**
   * Skill-cast attempt. Sends it to the server (which alone decides unlock level, cooldown,
   * resource and effect), and optimistically plays the cast locally right away, same pattern as
   * attemptAttack — see onCastEvent for the animation/VFX this drives, both here and for a
   * remote player's/mob's broadcast 'cast' event.
   */
  private castSkill(skillId: string, targetId?: string): void {
    const s = this.session;
    if (!s || !this.myId) return;
    if (s.predictor.current.hp <= 0) return;
    const skill = this.content.skills.find((sk) => sk.id === skillId);
    if (!skill) return;
    const now = performance.now();
    const cooldownMs = skill.cooldown * 1000;
    const last = this.lastCastAt.get(skillId) ?? -Infinity;
    if (now - last < cooldownMs) return; // client-side mirror only; server re-validates
    this.lastCastAt.set(skillId, now);
    this.castSeq += 1;
    this.net.send({ type: 'cast', seq: this.castSeq, skillId, aim: this.aimDirection, aimDeg: this.aimDegrees, targetId });
    this.hud.flashSkill(skillId);
    this.onCastEvent(s, { kind: 'cast', sourceId: this.myId, aim: this.aimDirection, skillId, targetId });
  }

  /**
   * Hover-to-attack: drives the current effective target (lock or hover) every frame — faces
   * it, approaches if out of range (unless the player has their own path going), and attacks on
   * cooldown once in range. Does nothing with no target, a dead target, or while dead itself.
   */
  private updateHoverCombat(s: Session): void {
    if (s.predictor.current.hp <= 0) return;
    const targetId = this.targeting.effectiveTargetId;
    if (!targetId) return;
    const target = s.mobs.get(targetId);
    const targetTile = target?.sprite.visualTile;
    if (!target || target.hp <= 0 || !targetTile) return;

    const foot = target.sprite.footPosition;
    const myFoot = s.sprite.footPosition;
    const dx = foot.x - myFoot.x, dy = foot.y - myFoot.y;
    this.aimDirection = snapAngleToDirection(dx, dy);
    this.aimDegrees = angleOfVector(dx, dy);

    const me = s.predictor.current;
    const distanceTiles = Math.hypot(targetTile.x - me.tileX, targetTile.y - me.tileY);
    if (distanceTiles <= this.myWeapon.rangeTiles) {
      if (this.clickToMove.currentOwner === 'auto') this.clickToMove.clear(); // close enough: stop approaching
      this.useSkill(this.hud.skillAt(0)?.id ?? null);
    } else if (!this.clickToMove.isActive || this.clickToMove.currentOwner === 'auto') {
      this.clickToMove.moveTo({ x: me.tileX, y: me.tileY }, targetTile, this.buildDynamicWorld(s), 'auto');
    }
  }

  /** Per-frame HUD work: cooldown sweep, resource/XP display, target ring position. */
  private updateCombatUi(): void {
    const s = this.session;
    if (!s) return;
    const basicProgress = Math.min(1, (performance.now() - this.lastAttackAt) / (this.myWeapon.cooldownTicks * this.tickLength));
    this.hud.setSkills(this.content.skills, this.myClassId, s.predictor.current.level); // no-op unless level just changed
    this.hud.updateCooldowns(this.you.cooldownsMs, basicProgress);
    this.hud.updatePlayerMp(this.you.resourceCurrent, this.you.resourceMax);
    this.hud.updateXp(this.you.xp, this.you.xpForLevel, s.predictor.current.level);

    const targetId = this.targeting.effectiveTargetId;
    const target = targetId ? s.mobs.get(targetId) : null;
    if (!target) {
      this.targetRing?.setVisible(false);
      return;
    }
    const foot = target.sprite.footPosition;
    const ring = this.ensureTargetRing();
    ring.setVisible(true).setPosition(foot.x, foot.y - 1).setDepth(foot.y - 0.5);
  }

  private ensureTargetRing(): Phaser.GameObjects.Image {
    if (this.targetRing) return this.targetRing;
    const fx = this.content.effects.effects['target-ring'];
    if (!fx) throw new Error('effects.json is missing the "target-ring" effect');
    const ring = this.add
      .image(0, 0, keys.effectSheet(fx.sheet, fx.frameWidth, fx.frameHeight), fx.startFrame)
      .setOrigin(0.5, 0.5)
      .setVisible(false);
    this.tweens.add({ targets: ring, alpha: { from: 0.5, to: 1 }, duration: 650, yoyo: true, repeat: -1 });
    this.targetRing = ring;
    return ring;
  }

  /** Explicitly locks a mob as the target (or clears the lock with `null`) — persists through
   * the pointer leaving, unlike a bare hover. Drives the target-frame display; combat itself
   * reads `targeting.effectiveTargetId`, not this call, so it never gates attacks on its own. */
  private lockTarget(mobId: string | null): void {
    const s = this.session;
    if (!s) return;
    const previous = this.targeting.effectiveTargetId;
    if (previous && previous !== mobId) {
      s.mobs.get(previous)?.sprite.removeLabel();
    }
    this.targeting.lock(mobId);
    if (!mobId) {
      this.hud.clearTarget();
      this.targetRing?.setVisible(false);
      return;
    }

    const entity = s.mobs.get(mobId);
    const def = entity?.kind ? this.content.mobs.mobs[entity.kind] : undefined;
    if (!entity || !def?.combat) {
      this.targeting.lock(null);
      return;
    }
    const hp = entity.hp;
    entity.sprite.setLabel(def.name, '#ffc8b8');
    this.hud.setTarget({
      name: def.name,
      level: def.level ?? 1,
      subtitle: hp > 0 ? 'Wandering creature' : 'Defeated',
      hp,
      maxHp: def.combat.maxHp,
      def,
    });
  }

  /** Clears a lock/hover pointing at `id` (it died-and-hid, or left interest range), and clears
   * the HUD/ring too if it was the effective target. */
  private forgetTarget(id: string): void {
    const wasEffective = this.targeting.effectiveTargetId === id;
    this.targeting.forget(id);
    if (wasEffective) {
      this.hud.clearTarget();
      this.targetRing?.setVisible(false);
    }
  }

  /** Tab-target: the nearest living mob on screen, cycling through the rest. Locks it, same as a click. */
  private cycleTarget(): void {
    const s = this.session;
    if (!s) return;
    const me = s.predictor.current;
    // Only what the player can actually see — targeting something off-screen
    // tells them nothing about what they just selected.
    const view = this.cameras.main.worldView;
    const candidates = [...s.mobs.entries()]
      .filter(([, m]) => m.sprite.visualTile && m.hp > 0)
      .filter(([, m]) => view.contains(m.sprite.footPosition.x, m.sprite.footPosition.y))
      .map(([id, m]) => {
        const tile = m.sprite.visualTile!;
        return { id, distance: Math.hypot(tile.x - me.tileX, tile.y - me.tileY) };
      })
      .sort((a, b) => a.distance - b.distance);
    if (candidates.length === 0) return;
    const currentIndex = candidates.findIndex((c) => c.id === this.targeting.effectiveTargetId);
    const next = candidates[(currentIndex + 1) % candidates.length];
    if (next) this.lockTarget(next.id);
  }

  // ---------- server-driven combat rendering ----------

  private handleCombatEvent(s: Session, e: CombatEvent): void {
    switch (e.kind) {
      case 'attack': return this.onAttackEvent(s, e);
      case 'cast': return this.onCastEvent(s, e);
      case 'windup': return this.onWindupEvent(s, e);
      case 'hit': return this.onHitEvent(s, e);
      case 'heal': return this.onHealEvent(s, e);
      case 'death': return this.onDeathEvent(s, e);
      case 'projectile': return this.onProjectileEvent(s, e);
      case 'aggro': return; // no visual of its own; the windup telegraph that follows carries it
    }
  }

  private onAttackEvent(s: Session, e: CombatEvent): void {
    const sprite = this.findEntitySprite(s, e.sourceId);
    if (!sprite) return;
    const aim = e.aim ?? sprite.facing;
    const weapon = this.resolveWeapon(s, e.sourceId);
    sprite.request('attacking', weapon.kind === 'ranged' ? 'attack_ranged' : 'attack', aim);
    const delta = DIRECTION_DELTAS[aim];
    const foot = sprite.footPosition;
    const fx = foot.x + delta.dx * 0.8 * s.map.tileSize.width;
    const fy = foot.y + delta.dy * 0.8 * s.map.tileSize.height;
    this.effects.play('slash', fx, fy - s.map.tileSize.height * 0.5, fy + 1);
  }

  /**
   * Renders a skill cast: plays the skill's own clip (if it has one — passives don't), then
   * spawns its VFX sheet at hit_ms (impact-style skills) or activate_ms (everything else,
   * including self-casts with no real "hit"), anchored on the caster's own foot point in the
   * caster's current facing. Fires for the local player's own optimistic cast and for every
   * remote player's/mob's broadcast 'cast' event alike (see findEntitySprite).
   */
  private onCastEvent(s: Session, e: CombatEvent): void {
    const sprite = this.findEntitySprite(s, e.sourceId);
    const skill = e.skillId ? this.content.skills.find((sk) => sk.id === e.skillId) : undefined;
    if (!sprite || !skill) return;
    const aim = e.aim ?? sprite.facing;
    if (skill.animation.clip) sprite.playSkillClip(skill.animation.clip, aim, skill.category === 'ultimate' ? 'attacking' : 'casting');
    const delayMs = skill.animation.hit_ms > 0 ? skill.animation.hit_ms : skill.animation.activate_ms;
    this.time.delayedCall(Math.max(0, delayMs), () => {
      if (this.session === s) this.spawnSkillVfx(sprite, skill, aim);
    });
  }

  /** Spawns one skill's VFX sheet, tinted per-class by the pre-rendered sheet itself (no runtime
   * tinting needed), anchor-to-anchor on the caster's own foot point (the manifest's `anchor` is
   * exactly this engine's own character anchor convention, so no per-effect offset is needed) and
   * showing the caster's facing row for a directional (aimed) sheet. */
  private spawnSkillVfx(sprite: EntitySprite, skill: Skill, aim: Direction): void {
    const { classId, archetype } = parseVfxRef(skill.vfx);
    const entry = this.content.vfxManifest.skills[skill.id];
    if (!entry) {
      console.warn(`[vfx] no manifest entry for skill "${skill.id}"`);
      return;
    }
    const { anchor, frame_size } = this.content.vfxManifest;
    const foot = sprite.footPosition;
    const img = this.add
      .sprite(foot.x, foot.y, keys.vfxSheet(classId, archetype))
      .setOrigin(anchor.x / frame_size, anchor.y / frame_size)
      .setDepth(foot.y + 0.4);
    img.play(keys.vfxAnim(classId, archetype, aim));
    if (entry.loop) {
      this.activeLoopingVfx.add(img);
      this.time.delayedCall(LOOPING_VFX_FALLBACK_MS, () => {
        if (!img.active) return;
        this.activeLoopingVfx.delete(img);
        img.destroy();
      });
    } else {
      img.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => img.destroy());
    }
  }

  private onHealEvent(s: Session, e: CombatEvent): void {
    if (!e.targetId) return;
    const target = this.resolveTarget(s, e.targetId);
    if (!target) return;
    const hpAfter = e.hpAfter ?? 0;
    const foot = target.sprite.footPosition;
    this.combatText.spawn(foot.x, target.sprite.headY - 6, `+${e.healing ?? 0}`, 'heal');
    target.sprite.setHealth(hpAfter, target.maxHp);
    if (e.targetId === this.myId) this.hud.updatePlayerHp(hpAfter, target.maxHp);
    const mobEntity = s.mobs.get(e.targetId);
    if (mobEntity) mobEntity.hp = hpAfter;
    const playerEntity = s.remotes.get(e.targetId);
    if (playerEntity) playerEntity.hp = hpAfter;
    if (this.targeting.effectiveTargetId === e.targetId) this.hud.updateTargetHp(hpAfter, target.maxHp);
  }

  private onWindupEvent(s: Session, e: CombatEvent): void {
    const remote = s.mobs.get(e.sourceId);
    if (!remote) return;
    const def = remote.kind ? this.content.mobs.mobs[remote.kind] : undefined;
    const windupTicks = def ? getAggro(def).attackWindupTicks : 12;
    this.showWindupTelegraph(remote.sprite, windupTicks * this.tickLength);
  }

  private onHitEvent(s: Session, e: CombatEvent): void {
    if (!e.targetId) return;
    const target = this.resolveTarget(s, e.targetId);
    if (!target) return;
    const hpAfter = e.hpAfter ?? 0;

    target.sprite.request('hit', 'hit', target.sprite.facing);
    target.sprite.flashHit();
    const foot = target.sprite.footPosition;
    this.effects.play(target.attackHitEffect ?? 'impact', foot.x, foot.y - target.frameHeight * 0.45, foot.y + 1);
    this.combatText.spawn(foot.x, target.sprite.headY - 6, e.crit ? `${e.damage}!` : `${e.damage ?? 0}`, e.crit ? 'crit' : 'damage');
    target.sprite.setHealth(hpAfter, target.maxHp);

    if (e.targetId === this.myId) this.hud.updatePlayerHp(hpAfter, target.maxHp);

    const mobEntity = s.mobs.get(e.targetId);
    if (mobEntity) mobEntity.hp = hpAfter;
    const playerEntity = s.remotes.get(e.targetId);
    if (playerEntity) playerEntity.hp = hpAfter;

    if (e.sourceId === this.myId && e.targetId !== this.myId && s.mobs.has(e.targetId)) this.lockTarget(e.targetId);
    if (this.targeting.effectiveTargetId === e.targetId) this.hud.updateTargetHp(hpAfter, target.maxHp);
  }

  private onDeathEvent(s: Session, e: CombatEvent): void {
    if (!e.targetId) return;
    const target = this.resolveTarget(s, e.targetId);
    if (target) {
      target.sprite.request('dead', 'death', target.sprite.facing);
      target.sprite.setHealth(null);
    }

    if (e.targetId === this.myId) {
      this.hud.setDowned(true);
      return;
    }
    const mobEntity = s.mobs.get(e.targetId);
    if (mobEntity) mobEntity.hp = 0;
    const playerEntity = s.remotes.get(e.targetId);
    if (playerEntity) playerEntity.hp = 0;

    if (e.sourceId === this.myId && mobEntity) {
      const def = mobEntity.kind ? this.content.mobs.mobs[mobEntity.kind] : undefined;
      // XP itself is server-authoritative now (World.ts awardXp) — the next snapshot's `you.xp`
      // already reflects it; this is just the "+XP" floatie's cue.
      this.time.delayedCall(260, () => {
        if (this.session === s) this.floatOverPlayer('+XP', 'xp');
      });
      if (this.targeting.effectiveTargetId === e.targetId && def?.combat) {
        this.hud.setTarget({ name: def.name, level: def.level ?? 1, subtitle: 'Defeated', hp: 0, maxHp: def.combat.maxHp, def });
      }
    }
  }

  private onProjectileEvent(s: Session, e: CombatEvent): void {
    const p = e.projectile;
    if (!p) return;
    const fxDef = this.content.effects.effects['projectile-bolt'];
    if (!fxDef) {
      console.warn('[effects] missing "projectile-bolt" in effects.json');
      return;
    }
    const mag = Math.hypot(p.dirX, p.dirY) || 1;
    const travelSeconds = p.rangeTiles / p.speedTilesPerSec;
    const [fx, fy] = s.map.tileFoot(p.fromX, p.fromY);
    const toX = p.fromX + (p.dirX / mag) * p.rangeTiles;
    const toY = p.fromY + (p.dirY / mag) * p.rangeTiles;
    const [tx, ty] = s.map.tileFoot(toX, toY);
    const riseY = s.map.tileSize.height * 0.3;
    const bolt = this.add
      .image(fx, fy - riseY, keys.effectSheet(fxDef.sheet, fxDef.frameWidth, fxDef.frameHeight), fxDef.startFrame)
      .setOrigin(0.5, 0.5)
      .setRotation(Math.atan2(p.dirY, p.dirX))
      .setDepth(fy + 1);
    this.tweens.add({
      targets: bolt,
      x: tx,
      y: ty - riseY,
      duration: travelSeconds * 1000,
      ease: 'Linear',
      onComplete: () => bolt.destroy(),
    });
  }

  private showWindupTelegraph(sprite: EntitySprite, durationMs: number): void {
    const fxDef = this.content.effects.effects['windup-telegraph'];
    if (!fxDef) {
      console.warn('[effects] missing "windup-telegraph" in effects.json');
      return;
    }
    const foot = sprite.footPosition;
    const marker = this.add
      .image(foot.x, foot.y - 2, keys.effectSheet(fxDef.sheet, fxDef.frameWidth, fxDef.frameHeight), fxDef.startFrame)
      .setOrigin(0.5, 0.5)
      .setDepth(foot.y - 0.4);
    this.tweens.add({ targets: marker, alpha: { from: 0.3, to: 1 }, duration: 160, yoyo: true, repeat: Math.max(0, Math.floor(durationMs / 320)) });
    this.time.delayedCall(durationMs, () => marker.destroy());
  }

  private findEntitySprite(s: Session, id: string): EntitySprite | null {
    if (id === this.myId) return s.sprite;
    return s.remotes.get(id)?.sprite ?? s.mobs.get(id)?.sprite ?? null;
  }

  /** Resolves an attack/hit target (local player, remote player, or mob) to what its UI needs. */
  private resolveTarget(s: Session, id: string): { sprite: EntitySprite; maxHp: number; frameHeight: number; attackHitEffect?: string } | null {
    if (id === this.myId) {
      return { sprite: s.sprite, maxHp: this.myCombat.maxHp, frameHeight: this.myFrameHeight };
    }
    const mobEntity = s.mobs.get(id);
    if (mobEntity?.kind) {
      const def = this.content.mobs.mobs[mobEntity.kind];
      if (def?.combat) return { sprite: mobEntity.sprite, maxHp: def.combat.maxHp, frameHeight: def.frameHeight, attackHitEffect: def.effects?.attackHit };
    }
    const playerEntity = s.remotes.get(id);
    if (playerEntity) {
      const info = s.infos.get(id);
      const def = findCharacter(this.content, info?.characterId ?? '');
      return { sprite: playerEntity.sprite, maxHp: def.combat?.maxHp ?? 100, frameHeight: def.frameHeight, attackHitEffect: def.effects?.attackHit };
    }
    return null;
  }

  /** Weapon of whoever just attacked (local player, remote player, or mob) — decides melee vs ranged animation. */
  private resolveWeapon(s: Session, sourceId: string): WeaponDefinition {
    if (sourceId === this.myId) return this.myWeapon;
    const mobEntity = s.mobs.get(sourceId);
    if (mobEntity?.kind) {
      const def = this.content.mobs.mobs[mobEntity.kind];
      if (def) return getWeapon(def);
    }
    const playerEntity = s.remotes.get(sourceId);
    if (playerEntity) {
      const info = s.infos.get(sourceId);
      return getWeapon(findCharacter(this.content, info?.characterId ?? ''));
    }
    return DEFAULT_WEAPON;
  }

  private floatOverPlayer(text: string, kind: 'miss' | 'xp'): void {
    const s = this.session;
    if (!s) return;
    const foot = s.sprite.footPosition;
    this.combatText.spawn(foot.x, s.sprite.headY, text, kind);
  }

  // ---------- dev debug overlay ----------

  private updateDebugOverlay(s: Session, pos: { x: number; y: number }): void {
    if (!this.debugOverlay) return;
    const mobs: DebugMobInfo[] = [];
    for (const [id, m] of s.mobs) {
      if (!m.kind) continue;
      const def = this.content.mobs.mobs[m.kind];
      if (!def) continue;
      const aggro = getAggro(def);
      const tile = m.sprite.visualTile;
      if (!tile) continue;
      mobs.push({ id, x: tile.x, y: tile.y, detectionRangeTiles: aggro.detectionRangeTiles, leashRangeTiles: aggro.leashRangeTiles, aiState: m.aiState ?? '' });
    }
    this.debugOverlay.draw({ player: { x: pos.x, y: pos.y, aim: this.aimDirection, weapon: this.myWeapon }, mobs, tileSize: s.map.tileSize });
  }

  private nearestMobDebugLabel(s: Session): string {
    const me = s.predictor.current;
    let best: { kind?: string; aiState?: string; hp: number; distance: number } | null = null;
    for (const m of s.mobs.values()) {
      const tile = m.sprite.visualTile;
      if (!tile) continue;
      const distance = Math.hypot(tile.x - me.tileX, tile.y - me.tileY);
      if (!best || distance < best.distance) best = { kind: m.kind, aiState: m.aiState, hp: m.hp, distance };
    }
    return best ? `${best.kind ?? '?'}:${best.aiState ?? '?'} hp${best.hp}` : 'no mobs nearby';
  }

  // ---------- setup helpers ----------

  /** Integer zoom keeps every texel the same size on screen (no shimmering pixel art). */
  private applyIntegerZoom(): void {
    const { width, height } = this.scale.gameSize;
    const { targetViewWidth, targetViewHeight } = this.content.config.client;
    this.zoom = Math.max(1, Math.floor(Math.min(width / targetViewWidth, height / targetViewHeight)));
    this.cameras.main.setZoom(this.zoom);
    const s = this.session;
    if (!s) return;
    s.sprite.setTextResolution(this.zoom);
    for (const remote of s.remotes.values()) remote.sprite.setTextResolution(this.zoom);
  }

  /** `?name=` and `?character=` from the URL; otherwise a random character so windows look different. */
  private chooseIdentity(): { name: string; characterId: string } {
    const params = new URLSearchParams(location.search);
    const all = this.content.characters.characters;
    const requested = params.get('character');
    const characterId = requested ?? all[Math.floor(Math.random() * all.length)]!.id;
    const name = params.get('name') ?? `${this.content.config.players.defaultName}${Math.floor(100 + Math.random() * 900)}`;
    return { name, characterId };
  }
}

/** Mobs block movement like players; give the predictor their movement fields. */
function mobAsMover(m: MobState): PlayerState {
  return { ...m, gait: 'walk', turnTicksLeft: 0, level: 1 };
}
