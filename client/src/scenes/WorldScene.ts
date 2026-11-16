import * as Phaser from 'phaser';
import {
  DIRECTION_DELTAS,
  isMoving,
  tickMs,
  type GameRules,
  type MobState,
  type PlayerState,
  type ServerMessage,
  type SnapshotMessage,
  type StepOutcome,
  type ZoneSnapshot,
} from '@thistlevane/shared';
import { CombatPreview } from '../combat/CombatPreview';
import { findCharacter, findMob, keys, type ClientContent, type SpriteRef } from '../content/ContentLoader';
import { EntitySprite } from '../entities/EntitySprite';
import { InputController } from '../input/InputController';
import { LocalPlayerPredictor } from '../net/LocalPlayerPredictor';
import { NetClient } from '../net/NetClient';
import { RemotePlayerBuffer } from '../net/RemotePlayerBuffer';
import { ServerClock } from '../net/ServerClock';
import { CombatTextManager } from '../ui/CombatText';
import { GameHud, SKILL_SLOTS } from '../ui/GameHud';
import { EffectsManager } from '../world/EffectsManager';
import { MapView } from '../world/MapView';

interface RemoteEntity {
  sprite: EntitySprite;
  buffer: RemotePlayerBuffer;
  /** Mob kind id (mobs only) — the key into mobs.json. */
  kind?: string;
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
 * fixed-tick prediction loop, and draws remote players and mobs interpolated
 * from server snapshots. All tuning comes from loaded content + server rules.
 */
export class WorldScene extends Phaser.Scene {
  private content!: ClientContent;
  private net!: NetClient;
  private controls!: InputController;
  private hud!: GameHud;
  private effects!: EffectsManager;
  private combatText!: CombatTextManager;
  private combat: CombatPreview | null = null;
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
    this.effects = new EffectsManager(this, this.content.effects);
    this.combatText = new CombatTextManager(this);

    this.hud.onSkill = (slot) => this.useSkill(slot.id);
    this.bindCombatKeys();

    this.net = new NetClient(NetClient.defaultUrl(config.network.wsPath));
    this.net.onStatusChange = (status) => {
      if (status === 'open') this.net.send({ type: 'join', ...this.chooseIdentity() });
      this.hud.setStatus(status);
    };
    this.net.onMessage = (msg) => this.handleMessage(msg);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.net.close();
      this.controls.destroy();
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

    // Fixed-timestep local simulation, matching the server's tick length.
    this.accumulator += Math.min(elapsed, this.content.config.client.maxFrameMs);
    while (this.accumulator >= this.tickLength) {
      this.onLocalOutcome(s.predictor.tick(this.controls.intent));
      this.accumulator -= this.tickLength;
    }
    const pos = s.predictor.renderPosition(this.accumulator / this.tickLength);
    const me = s.predictor.current;
    s.sprite.update(pos.x, pos.y, me.facing, isMoving(me), me.gait);

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
    this.updateCombatUi(elapsed);
    this.hud.update({
      zone: this.content.zones.zones[s.zoneId]?.name ?? s.zoneId,
      tile: `${me.tileX},${me.tileY} L${s.map.model.levelAt(me.tileX, me.tileY)}`,
      playerCount: s.remotes.size + 1,
      mobCount: s.mobs.size,
      corrections: s.predictor.corrections,
      pendingInputs: s.predictor.pendingCount,
      gait: me.gait,
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
        // Carry level/XP across a zone change; health is not simulated yet.
        const level = this.combat?.level ?? 1;
        const xp = this.combat?.xp ?? 0;
        this.combat = new CombatPreview(stats, () => performance.now());
        this.combat.level = level;
        this.combat.xp = xp;
        this.hud.setPlayer(info?.name ?? '?', characterId, level, stats);
        this.hud.updateXp(xp, this.combat.xpForLevel, level);
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
    this.combat?.clear();
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
        remote = { sprite: this.createCharacter(s, state.id, false), buffer: new RemotePlayerBuffer() };
        s.remotes.set(state.id, remote);
      }
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
        remote = { sprite: this.createEntity(s, ref, null), buffer: new RemotePlayerBuffer(), kind: mob.kind };
        const mobId = mob.id;
        remote.sprite.sprite.setInteractive({ useHandCursor: true });
        remote.sprite.sprite.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.selectTarget(mobId));
        if (this.combat?.isDefeated(mobId)) remote.sprite.setDefeated(true);
        s.mobs.set(mob.id, remote);
      }
      remote.buffer.push(serverTime, { ...mob, gait: 'walk', turnTicksLeft: 0 });
    }
    for (const [id, m] of s.mobs) {
      if (seenMobs.has(id)) continue;
      m.sprite.destroy();
      s.mobs.delete(id);
      if (this.combat?.targetId === id) this.selectTarget(null); // it walked out of range
    }
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

  // ---------- combat preview (client-side only; see CombatPreview) ----------

  private bindCombatKeys(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    // Tab would move browser focus out of the canvas, so the scene claims it.
    kb.addCapture(['TAB', 'SPACE', 'ESC']);
    kb.on('keydown-SPACE', () => this.useSkill('strike'));
    kb.on('keydown-TAB', () => this.cycleTarget());
    kb.on('keydown-ESC', () => this.selectTarget(null));
    SKILL_SLOTS.forEach((slot, i) => {
      const key = DIGIT_KEYS[i];
      if (key) kb.on(`keydown-${key}`, () => this.useSkill(slot.id));
    });
  }

  /** Per-frame HUD work: cooldown sweep, mana regen, target frame and ring. */
  private updateCombatUi(elapsedMs: number): void {
    const s = this.session;
    const c = this.combat;
    if (!s || !c) return;

    c.tick(elapsedMs);
    this.hud.setCooldown(0, c.cooldownProgress());
    this.hud.updatePlayerMp(c.mp, c.maxMp);
    this.hud.updateXp(c.xp, c.xpForLevel, c.level);

    const target = c.targetId ? s.mobs.get(c.targetId) : null;
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

  /** Selects a mob (or clears the target with `null`). */
  private selectTarget(mobId: string | null): void {
    const s = this.session;
    const c = this.combat;
    if (!s || !c) return;

    if (c.targetId && c.targetId !== mobId) {
      const previous = s.mobs.get(c.targetId);
      previous?.sprite.removeLabel();
      previous?.sprite.setHealth(null);
    }
    c.targetId = mobId;
    if (!mobId) {
      this.hud.clearTarget();
      this.targetRing?.setVisible(false);
      return;
    }

    const entity = s.mobs.get(mobId);
    const def = entity?.kind ? this.content.mobs.mobs[entity.kind] : undefined;
    if (!entity || !def?.combat) {
      c.targetId = null;
      return;
    }
    const hp = c.hpOf(mobId, def.combat.maxHp);
    entity.sprite.setLabel(def.name, '#ffc8b8');
    entity.sprite.setHealth(hp, def.combat.maxHp);
    this.hud.setTarget({
      name: def.name,
      level: def.level ?? 1,
      subtitle: hp > 0 ? 'Wandering creature' : 'Defeated',
      hp,
      maxHp: def.combat.maxHp,
      def,
    });
  }

  /** Tab-target: the nearest living mob on screen, cycling through the rest. */
  private cycleTarget(): void {
    const s = this.session;
    const c = this.combat;
    if (!s || !c) return;
    const me = s.predictor.current;
    // Only what the player can actually see — targeting something off-screen
    // tells them nothing about what they just selected.
    const view = this.cameras.main.worldView;
    const candidates = [...s.mobs.entries()]
      .filter(([id, m]) => m.sprite.visualTile && !c.isDefeated(id))
      .filter(([, m]) => view.contains(m.sprite.footPosition.x, m.sprite.footPosition.y))
      .map(([id, m]) => {
        const tile = m.sprite.visualTile!;
        return { id, distance: Math.hypot(tile.x - me.tileX, tile.y - me.tileY) };
      })
      .sort((a, b) => a.distance - b.distance);
    if (candidates.length === 0) return;
    const currentIndex = candidates.findIndex((m) => m.id === c.targetId);
    const next = candidates[(currentIndex + 1) % candidates.length];
    if (next) this.selectTarget(next.id);
  }

  private useSkill(id: string): void {
    const slot = SKILL_SLOTS.find((entry) => entry.id === id);
    const s = this.session;
    if (!slot || !s) return;
    if (slot.locked) {
      this.floatOverPlayer(`${slot.name} not learned`, 'miss');
      return;
    }
    this.strike();
  }

  /** The one wired skill: swing the weapon, then resolve on the impact frame. */
  private strike(): void {
    const s = this.session;
    const c = this.combat;
    if (!s || !c) return;
    if (!c.canAttack()) {
      if (c.mp < 6) this.floatOverPlayer('No energy', 'miss');
      return;
    }
    c.beginAttack();
    this.hud.flashSlot(0);

    const me = s.predictor.current;
    s.sprite.playCombat('attack', me.facing);

    // The arc lands a tile ahead, on the attack animation's impact frame.
    const delta = DIRECTION_DELTAS[me.facing];
    const position = s.predictor.renderPosition(0);
    const [fx, fy] = s.map.tileFoot(position.x + delta.dx * 0.8, position.y + delta.dy * 0.8);
    this.time.delayedCall(90, () => {
      if (this.session !== s) return;
      this.effects.play('slash', fx, fy - s.map.tileSize.height * 0.5, fy + 1);
    });
    this.time.delayedCall(150, () => {
      if (this.session === s) this.resolveStrike(s, c);
    });
  }

  private resolveStrike(s: Session, c: CombatPreview): void {
    if (!c.targetId) return;
    const entity = s.mobs.get(c.targetId);
    const def = entity?.kind ? this.content.mobs.mobs[entity.kind] : undefined;
    if (!entity || !def?.combat || c.isDefeated(c.targetId)) return;

    const tile = entity.sprite.visualTile;
    const me = s.predictor.current;
    if (!tile || Math.max(Math.abs(tile.x - me.tileX), Math.abs(tile.y - me.tileY)) > 1) {
      this.floatOverPlayer('Out of range', 'miss');
      return;
    }

    const result = c.resolveAttack(c.targetId, def.combat);
    const foot = entity.sprite.footPosition;
    this.effects.play(def.effects?.attackHit ?? 'impact', foot.x, foot.y - def.frameHeight * 0.45, foot.y + 1);
    entity.sprite.flashHit();
    entity.sprite.setHealth(result.hpAfter, def.combat.maxHp);
    this.combatText.spawn(
      foot.x,
      entity.sprite.headY - 6, // clear of the nameplate
      result.crit ? `${result.damage}!` : `${result.damage}`,
      result.crit ? 'crit' : 'damage',
    );
    this.hud.updateTargetHp(result.hpAfter, def.combat.maxHp);

    if (result.defeated) {
      entity.sprite.setDefeated(true);
      entity.sprite.setHealth(null);
      entity.sprite.setLabel(def.name, '#8a7e68');
      this.hud.setTarget({
        name: def.name,
        level: def.level ?? 1,
        subtitle: 'Defeated',
        hp: 0,
        maxHp: def.combat.maxHp,
        def,
      });
      this.time.delayedCall(260, () => {
        if (this.session === s) this.floatOverPlayer('+XP', 'xp');
      });
    }
  }

  private floatOverPlayer(text: string, kind: 'miss' | 'xp'): void {
    const s = this.session;
    if (!s) return;
    const foot = s.sprite.footPosition;
    this.combatText.spawn(foot.x, s.sprite.headY, text, kind);
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
