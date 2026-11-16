import * as Phaser from 'phaser';
import {
  DEFAULT_WEAPON,
  DIRECTION_DELTAS,
  getAggro,
  getWeapon,
  isMoving,
  snapAngleToDirection,
  tickMs,
  type CombatEvent,
  type CombatStats,
  type Direction,
  type GameRules,
  type MobState,
  type PlayerState,
  type ServerMessage,
  type SnapshotMessage,
  type StepOutcome,
  type WeaponDefinition,
  type ZoneSnapshot,
} from '@thistlevane/shared';
import { ClientProgression } from '../combat/ClientProgression';
import { findCharacter, findMob, keys, type ClientContent, type SpriteRef } from '../content/ContentLoader';
import { EntitySprite } from '../entities/EntitySprite';
import { InputController } from '../input/InputController';
import { LocalPlayerPredictor } from '../net/LocalPlayerPredictor';
import { NetClient } from '../net/NetClient';
import { RemotePlayerBuffer } from '../net/RemotePlayerBuffer';
import { ServerClock } from '../net/ServerClock';
import { CombatTextManager } from '../ui/CombatText';
import { GameHud, SKILL_SLOTS } from '../ui/GameHud';
import { DebugOverlay, type DebugMobInfo } from '../world/DebugOverlay';
import { EffectsManager } from '../world/EffectsManager';
import { MapView } from '../world/MapView';

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
  private effects!: EffectsManager;
  private combatText!: CombatTextManager;
  private debugOverlay: DebugOverlay | null = null;
  private readonly progression = new ClientProgression();
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
  private mouseWorldTile = { x: 0, y: 0 };
  private myWeapon: WeaponDefinition = DEFAULT_WEAPON;
  private myCombat: CombatStats = { maxHp: 100, maxMp: 50, attack: 10, defense: 5 };
  private myFrameHeight = 96;
  private attackSeq = 0;
  /** Client-side mirror only (drives the hotbar sweep); the server independently re-validates. */
  private lastAttackAt = -Infinity;
  private selectedTargetId: string | null = null;

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

    this.hud = new GameHud(document.getElementById('game-ui')!, this.content);
    this.controls = new InputController(config.client.controls);
    this.controls.onAttackPressed = () => this.attemptAttack();
    this.effects = new EffectsManager(this, this.content.effects);
    this.combatText = new CombatTextManager(this);
    this.debugOverlay = import.meta.env.DEV ? new DebugOverlay(this) : null;

    this.hud.onSkill = (slot) => this.useSkill(slot.id);
    this.bindCombatKeys();
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer));
    // Left click is the brief's own fallback trigger — works with no physical numpad.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) this.attemptAttack();
    });

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
      if (alive) this.onLocalOutcome(s.predictor.tick(this.controls.intent));
      this.accumulator -= this.tickLength;
    }
    const pos = s.predictor.renderPosition(this.accumulator / this.tickLength);
    const me = s.predictor.current;
    s.sprite.update(pos.x, pos.y, me.facing, alive && isMoving(me), me.gait);
    this.hud.setDowned(!alive);

    const serverNow = this.clock.serverNow();
    if (serverNow !== null) {
      const renderTime = serverNow - this.content.config.client.interpolationDelayMs;
      for (const group of [s.remotes, s.mobs]) {
        for (const remote of group.values()) {
          const pose = remote.buffer.sample(renderTime);
          if (pose) remote.sprite.update(pose.x, pose.y, pose.facing, pose.moving, pose.gait);
        }
      }
    }

    s.map.update(now);
    this.updateCombatUi();
    this.updateDebugOverlay(s, pos);
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

  // ---------- networking ----------

  private handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'welcome':
        this.myId = msg.yourId;
        this.rules = msg.rules;
        this.tickLength = tickMs(msg.rules);
        this.clock = new ServerClock(this.tickLength);
        this.enterZone(msg);
        return;
      case 'zoneChange':
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

        const session: Session = { zoneId: zone.zoneId, map, predictor, sprite: null as unknown as EntitySprite, remotes: new Map(), mobs: new Map(), infos };
        session.sprite = this.createCharacter(session, myId, true);
        this.session = session;
        this.accumulator = 0;
        this.loadingZone = null;

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
        this.hud.setPlayer(info?.name ?? '?', characterId, this.progression.level, stats);
        this.hud.updatePlayerHp(me.hp, stats.maxHp);
        this.hud.updateXp(this.progression.xp, this.progression.xpForLevel, this.progression.level);
        this.hud.setDowned(me.hp <= 0);
        this.selectedTargetId = null;
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
    this.targetRing?.setVisible(false);
    this.hud.clearTarget();
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

    let mine: PlayerState | null = null;
    const others: PlayerState[] = [];
    for (const state of msg.players) {
      if (state.id === this.myId) mine = state;
      else others.push(state);
    }
    if (!mine) return; // snapshot from the zone we just left
    s.predictor.reconcile(mine, msg.ackSeq, [...others, ...msg.mobs.map(mobAsMover)]);

    const seenPlayers = new Set<string>();
    for (const state of others) {
      seenPlayers.add(state.id);
      let remote = s.remotes.get(state.id);
      if (!remote) {
        remote = { sprite: this.createCharacter(s, state.id, false), buffer: new RemotePlayerBuffer(), hp: state.hp };
        s.remotes.set(state.id, remote);
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
        remote.sprite.sprite.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.selectTarget(mobId));
        // A late joiner must see an already-damaged/defeated mob correctly, not at full health.
        const maxHp = this.content.mobs.mobs[mob.kind]?.combat?.maxHp ?? mob.hp;
        if (mob.hp <= 0) remote.sprite.setDefeated(true);
        else if (mob.hp < maxHp) remote.sprite.setHealth(mob.hp, maxHp);
        s.mobs.set(mob.id, remote);
      } else if (remote.hp <= 0 && mob.hp > 0) {
        // Respawned: the server resets hp without a dedicated event; detect the transition here.
        remote.sprite.setDefeated(false);
        remote.sprite.setHealth(null);
      }
      remote.hp = mob.hp;
      remote.aiState = mob.aiState;
      remote.buffer.push(serverTime, { ...mob, gait: 'walk', turnTicksLeft: 0 });
    }
    for (const [id, m] of s.mobs) {
      if (seenMobs.has(id)) continue;
      m.sprite.destroy();
      s.mobs.delete(id);
      if (this.selectedTargetId === id) this.selectTarget(null); // it walked out of range
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
    const sprite = new EntitySprite(this, ref, s.map.tileSize, label, this.content.config.client.nameLabel, this.zoom);
    sprite.onCombatComplete = () => {}; // combatLock clears automatically; no extra bookkeeping needed yet
    return sprite;
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
    this.aimDirection = snapAngleToDirection(world.x - foot.x, world.y - foot.y);
    this.mouseWorldTile = { x: world.x / s.map.tileSize.width, y: world.y / s.map.tileSize.height };
  }

  // ---------- combat input ----------

  private bindCombatKeys(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    // Tab would move browser focus out of the canvas, so the scene claims it.
    kb.addCapture(['TAB', 'ESC']);
    kb.on('keydown-TAB', () => this.cycleTarget());
    kb.on('keydown-ESC', () => this.selectTarget(null));
    SKILL_SLOTS.forEach((slot, i) => {
      if (slot.id === 'strike') return; // Numpad1 (InputController) and the hotbar click own this now
      const key = DIGIT_KEYS[i];
      if (key) kb.on(`keydown-${key}`, () => this.useSkill(slot.id));
    });
  }

  private useSkill(id: string): void {
    const slot = SKILL_SLOTS.find((entry) => entry.id === id);
    const s = this.session;
    if (!slot || !s) return;
    if (slot.locked) {
      this.floatOverPlayer(`${slot.name} not learned`, 'miss');
      return;
    }
    this.attemptAttack();
  }

  /**
   * Mouse-directed basic attack: no target selection required. Sends the
   * attack to the server (which alone decides cooldown/range/damage), and
   * optimistically plays the local swing right away for responsiveness — the
   * same cosmetic path a remote player's broadcast 'attack' event uses.
   */
  private attemptAttack(): void {
    const s = this.session;
    if (!s || !this.myId) return;
    if (s.predictor.current.hp <= 0) return; // dead: no attacking
    const now = performance.now();
    const cooldownMs = this.myWeapon.cooldownTicks * this.tickLength;
    if (now - this.lastAttackAt < cooldownMs) return; // client-side mirror only; server re-validates
    this.lastAttackAt = now;
    this.attackSeq += 1;
    this.net.send({ type: 'attack', seq: this.attackSeq, aim: this.aimDirection });
    this.hud.flashSlot(0);
    this.onAttackEvent(s, { kind: 'attack', sourceId: this.myId, aim: this.aimDirection });
  }

  /** Per-frame HUD work: cooldown sweep, XP display, target ring position. */
  private updateCombatUi(): void {
    const s = this.session;
    if (!s) return;
    const progress = Math.min(1, (performance.now() - this.lastAttackAt) / (this.myWeapon.cooldownTicks * this.tickLength));
    this.hud.setCooldown(0, progress);
    this.hud.updateXp(this.progression.xp, this.progression.xpForLevel, this.progression.level);

    const target = this.selectedTargetId ? s.mobs.get(this.selectedTargetId) : null;
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

  /** Selects a mob (or clears the target with `null`) for the target-frame *display* only — never gates attacks. */
  private selectTarget(mobId: string | null): void {
    const s = this.session;
    if (!s) return;
    if (this.selectedTargetId && this.selectedTargetId !== mobId) {
      s.mobs.get(this.selectedTargetId)?.sprite.removeLabel();
    }
    this.selectedTargetId = mobId;
    if (!mobId) {
      this.hud.clearTarget();
      this.targetRing?.setVisible(false);
      return;
    }

    const entity = s.mobs.get(mobId);
    const def = entity?.kind ? this.content.mobs.mobs[entity.kind] : undefined;
    if (!entity || !def?.combat) {
      this.selectedTargetId = null;
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

  /** Tab-target: the nearest living mob on screen, cycling through the rest. Display only. */
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
    const currentIndex = candidates.findIndex((c) => c.id === this.selectedTargetId);
    const next = candidates[(currentIndex + 1) % candidates.length];
    if (next) this.selectTarget(next.id);
  }

  // ---------- server-driven combat rendering ----------

  private handleCombatEvent(s: Session, e: CombatEvent): void {
    switch (e.kind) {
      case 'attack': return this.onAttackEvent(s, e);
      case 'windup': return this.onWindupEvent(s, e);
      case 'hit': return this.onHitEvent(s, e);
      case 'death': return this.onDeathEvent(s, e);
      case 'projectile': return this.onProjectileEvent(s, e);
      case 'aggro': return; // no visual of its own; the windup telegraph that follows carries it
    }
  }

  private onAttackEvent(s: Session, e: CombatEvent): void {
    const sprite = this.findEntitySprite(s, e.sourceId);
    if (!sprite) return;
    const aim = e.aim ?? sprite.facing;
    sprite.playCombat('attack', aim);
    const delta = DIRECTION_DELTAS[aim];
    const foot = sprite.footPosition;
    const fx = foot.x + delta.dx * 0.8 * s.map.tileSize.width;
    const fy = foot.y + delta.dy * 0.8 * s.map.tileSize.height;
    this.effects.play('slash', fx, fy - s.map.tileSize.height * 0.5, fy + 1);
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

    target.sprite.playCombat('hit', target.sprite.facing);
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

    if (e.sourceId === this.myId && e.targetId !== this.myId && s.mobs.has(e.targetId)) this.selectTarget(e.targetId);
    if (this.selectedTargetId === e.targetId) this.hud.updateTargetHp(hpAfter, target.maxHp);
  }

  private onDeathEvent(s: Session, e: CombatEvent): void {
    if (!e.targetId) return;
    const target = this.resolveTarget(s, e.targetId);
    if (target) {
      target.sprite.playCombat('death', target.sprite.facing);
      target.sprite.setDefeated(true);
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
      if (def?.combat) this.progression.awardXp(def.combat);
      this.time.delayedCall(260, () => {
        if (this.session === s) this.floatOverPlayer('+XP', 'xp');
      });
      if (this.selectedTargetId === e.targetId && def?.combat) {
        this.hud.setTarget({ name: def.name, level: def.level ?? 1, subtitle: 'Defeated', hp: 0, maxHp: def.combat.maxHp, def });
      }
    }
  }

  private onProjectileEvent(s: Session, e: CombatEvent): void {
    const p = e.projectile;
    if (!p) return;
    const mag = Math.hypot(p.dirX, p.dirY) || 1;
    const travelSeconds = p.rangeTiles / p.speedTilesPerSec;
    const [fx, fy] = s.map.tileFoot(p.fromX, p.fromY);
    const toX = p.fromX + (p.dirX / mag) * p.rangeTiles;
    const toY = p.fromY + (p.dirY / mag) * p.rangeTiles;
    const [tx, ty] = s.map.tileFoot(toX, toY);
    const riseY = s.map.tileSize.height * 0.3;
    const bolt = this.add.circle(fx, fy - riseY, 3, 0xfff066, 1).setDepth(fy + 1);
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
    const foot = sprite.footPosition;
    const marker = this.add.circle(foot.x, foot.y - 2, 6, 0xff3030, 0.5).setDepth(foot.y - 0.4);
    this.tweens.add({ targets: marker, alpha: { from: 0.2, to: 0.7 }, duration: 160, yoyo: true, repeat: Math.max(0, Math.floor(durationMs / 320)) });
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
  return { ...m, gait: 'walk', turnTicksLeft: 0 };
}
