import {
  PlayerAwareWalkability,
  clonePlayerState,
  occupiesTile,
  stepMovement,
  type GameConfig,
  type MapModel,
  type MobCatalog,
  type MobState,
  type MoveIntent,
  type Mover,
  type PlayerState,
  type Portal,
} from '@thistlevane/shared';
import { Mob } from './Mob';
import { Player } from './Player';

const IDLE: MoveIntent = { dir: null, run: false };

export interface PortalCrossing {
  player: Player;
  portal: Portal;
}

/**
 * Authoritative state for one zone: its players and mobs. Pure game logic, no
 * networking. Several Worlds run side by side (one per zone) under WorldManager.
 */
export class World {
  readonly players = new Map<string, Player>();
  readonly mobs = new Map<string, Mob>();
  tick = 0;
  private readonly random: () => number;

  constructor(
    readonly zoneId: string,
    readonly map: MapModel,
    private readonly config: GameConfig,
    mobCatalog: MobCatalog,
    seed = 1,
  ) {
    this.random = mulberry32(seed);
    this.spawnMobs(mobCatalog);
  }

  /** Add a player at a named spawn (or the first one). The caller supplies a globally unique id. */
  addPlayer(id: string, name: string, characterId: string, spawnName?: string): Player {
    const spawn = this.findFreeSpawnTile(spawnName);
    const player = new Player(id, name, characterId, spawn.tileX, spawn.tileY, this.config.movement, this.config.network.maxInputCredits);
    player.lastInputTick = this.tick;
    this.players.set(id, player);
    return player;
  }

  /** Re-home an existing player (zone transfer): keeps identity, resets movement + input state. */
  placePlayer(player: Player, spawnName: string): void {
    const spawn = this.findFreeSpawnTile(spawnName);
    player.resetAt(spawn.tileX, spawn.tileY, this.config.movement);
    player.lastInputTick = this.tick;
    this.players.set(player.id, player);
  }

  removePlayer(id: string): boolean {
    return this.players.delete(id);
  }

  /** Accept one tick of movement intent from a client. Invalid/duplicate inputs are dropped. */
  queueInput(playerId: string, seq: number, intent: MoveIntent): void {
    const player = this.players.get(playerId);
    if (!player) return;
    if (seq <= player.lastQueuedSeq) return; // duplicate or out-of-order
    player.lastQueuedSeq = seq;
    player.lastInputTick = this.tick;
    if (player.inputQueue.length >= this.config.network.maxQueuedInputs) return; // flooding: drop; client reconciles
    player.inputQueue.push({ seq, dir: intent.dir, run: intent.run, arrivedTick: this.tick });
  }

  /** Advance the simulation by one fixed tick. Returns players who finished a step on a portal. */
  step(): PortalCrossing[] {
    this.tick += 1;
    const { maxInputCredits, idleFillAfterTicks, inputJitterBufferTicks: buffer } = this.config.network;
    const movers = () => this.allMovers();
    const crossings: PortalCrossing[] = [];

    for (const player of this.players.values()) {
      const walkability = new PlayerAwareWalkability(this.map, movers, player.id, this.config.movement);
      player.inputCredits = Math.min(maxInputCredits, player.inputCredits + 1);
      const queue = player.inputQueue;

      // Jitter buffer: after a pause, wait until a few inputs have queued up (or the oldest
      // has waited long enough) so the stream is then consumed at a steady one per tick.
      if (queue.length === 0) player.buffering = true;
      else if (player.buffering && (queue.length >= buffer || this.tick - queue[0]!.arrivedTick >= buffer)) {
        player.buffering = false;
      }

      let processed = 0;
      if (!player.buffering) {
        const budget = queue.length > buffer + 1 ? 2 : 1;
        while (processed < budget && queue.length > 0 && player.inputCredits >= 1) {
          const input = queue.shift()!;
          stepMovement(player.state, input, walkability, this.config.movement);
          player.lastAppliedSeq = input.seq;
          player.inputCredits -= 1;
          processed += 1;
        }
      }
      if (processed === 0 && queue.length === 0 && this.tick - player.lastInputTick >= idleFillAfterTicks) {
        stepMovement(player.state, IDLE, walkability, this.config.movement);
      }

      if (player.state.moveTicksLeft === 0) {
        const portal = this.map.portalAt(player.state.tileX, player.state.tileY);
        if (portal) crossings.push({ player, portal });
      }
    }

    for (const mob of this.mobs.values()) {
      mob.tick(new PlayerAwareWalkability(this.map, movers, mob.id, mob.rules));
    }
    return crossings;
  }

  snapshotStates(): PlayerState[] {
    return [...this.players.values()].map((p) => clonePlayerState(p.state));
  }

  snapshotMobs(): MobState[] {
    return [...this.mobs.values()].map((m) => m.snapshot());
  }

  /** Players and mobs within `radius` tiles (Chebyshev) of a point. */
  nearby(tileX: number, tileY: number, radius: number): { players: PlayerState[]; mobs: MobState[] } {
    const near = (s: Mover) => Math.abs(s.tileX - tileX) <= radius && Math.abs(s.tileY - tileY) <= radius;
    const players: PlayerState[] = [];
    for (const p of this.players.values()) if (near(p.state)) players.push(clonePlayerState(p.state));
    const mobs: MobState[] = [];
    for (const m of this.mobs.values()) if (near(m.state)) mobs.push(m.snapshot());
    return { players, mobs };
  }

  private *allMovers(): Iterable<Mover> {
    for (const p of this.players.values()) yield p.state;
    for (const m of this.mobs.values()) yield m.state;
  }

  private spawnMobs(catalog: MobCatalog): void {
    let n = 0;
    for (const region of this.map.mobSpawns) {
      const def = catalog.mobs[region.mob];
      if (!def) continue;
      let placed = 0, tries = 0;
      while (placed < region.count && tries++ < region.count * 20) {
        const x = region.x + Math.floor(this.random() * region.w);
        const y = region.y + Math.floor(this.random() * region.h);
        if (!this.map.isWalkable(x, y) || this.isOccupied(x, y)) continue;
        const id = `m${this.zoneId}:${n++}`;
        this.mobs.set(id, new Mob(id, region.mob, def, region, x, y, this.random));
        placed++;
      }
    }
  }

  private isOccupied(x: number, y: number): boolean {
    for (const m of this.allMovers()) if (occupiesTile(m, x, y)) return true;
    return false;
  }

  /** Nearest walkable tile to the spawn that nobody occupies. */
  private findFreeSpawnTile(spawnName?: string): { tileX: number; tileY: number } {
    const start = (spawnName && this.map.spawnByName(spawnName)) || this.map.spawnPoints[0]!;
    const queue = [{ tileX: start.tileX, tileY: start.tileY }];
    const seen = new Set([`${start.tileX},${start.tileY}`]);
    while (queue.length > 0) {
      const tile = queue.shift()!;
      if (!this.isOccupied(tile.tileX, tile.tileY)) return tile;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const next = { tileX: tile.tileX + dx, tileY: tile.tileY + dy };
        const key = `${next.tileX},${next.tileY}`;
        if (!seen.has(key) && this.map.isWalkable(next.tileX, next.tileY, tile.tileX, tile.tileY)) {
          seen.add(key);
          queue.push(next);
        }
      }
    }
    return { tileX: start.tileX, tileY: start.tileY };
  }
}

/** Small seeded PRNG so mob placement is reproducible per zone. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
