import * as Phaser from 'phaser';
import {
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
import { findCharacter, findMob, type ClientContent, type SpriteRef } from '../content/ContentLoader';
import { EntitySprite } from '../entities/EntitySprite';
import { InputController } from '../input/InputController';
import { LocalPlayerPredictor } from '../net/LocalPlayerPredictor';
import { NetClient } from '../net/NetClient';
import { RemotePlayerBuffer } from '../net/RemotePlayerBuffer';
import { ServerClock } from '../net/ServerClock';
import { DevHud } from '../ui/DevHud';
import { EffectsManager } from '../world/EffectsManager';
import { MapView } from '../world/MapView';

interface RemoteEntity {
  sprite: EntitySprite;
  buffer: RemotePlayerBuffer;
}

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
  private hud!: DevHud;
  private effects!: EffectsManager;
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

    this.hud = new DevHud(document.getElementById('hud'), this.content);
    this.controls = new InputController(config.client.controls);
    this.effects = new EffectsManager(this, this.content.effects);

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
        this.hud.setIdentity(info?.name ?? '?', myId, info?.characterId ?? '?');
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
        remote = { sprite: this.createEntity(s, ref, null), buffer: new RemotePlayerBuffer() };
        s.mobs.set(mob.id, remote);
      }
      remote.buffer.push(serverTime, { ...mob, gait: 'walk', turnTicksLeft: 0 });
    }
    for (const [id, m] of s.mobs) if (!seenMobs.has(id)) { m.sprite.destroy(); s.mobs.delete(id); }
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
