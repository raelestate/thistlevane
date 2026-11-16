import {
  DIRECTION_DELTAS,
  PlayerAwareWalkability,
  clonePlayerState,
  meleeHitTest,
  occupiesTile,
  resolveDamage,
  stepMovement,
  tilePosition,
  type CombatEvent,
  type CombatStats,
  type Direction,
  type GameConfig,
  type MapModel,
  type MobCatalog,
  type MobState,
  type MoveIntent,
  type Mover,
  type PlayerState,
  type Portal,
  type WeaponDefinition,
} from '@thistlevane/shared';
import { Mob } from './Mob';
import { Player } from './Player';
import { Projectile, PROJECTILE_HIT_RADIUS_TILES } from './Projectile';

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
  readonly projectiles = new Map<string, Projectile>();
  tick = 0;
  /** Combat occurrences from the tick just run; read by ConnectionManager, cleared at the top of the next step(). */
  pendingEvents: CombatEvent[] = [];
  private readonly random: () => number;
  private nextProjectileId = 1;

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
  addPlayer(id: string, name: string, characterId: string, combat: CombatStats, weapon: WeaponDefinition, spawnName?: string): Player {
    const spawn = this.findFreeSpawnTile(spawnName);
    const player = new Player(id, name, characterId, spawn.tileX, spawn.tileY, this.config.movement, this.config.network.maxInputCredits, combat, weapon);
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

  /** Accept one basic-attack attempt. Deduped by its own seq, independent of movement input. */
  queueAttack(playerId: string, seq: number, aim: Direction): void {
    const player = this.players.get(playerId);
    if (!player) return;
    if (seq <= player.lastQueuedAttackSeq) return;
    player.lastQueuedAttackSeq = seq;
    if (player.attackQueue.length >= this.config.network.maxQueuedInputs) return;
    player.attackQueue.push({ seq, aim, arrivedTick: this.tick });
  }

  /** Advance the simulation by one fixed tick. Returns players who finished a step on a portal. */
  step(): PortalCrossing[] {
    this.tick += 1;
    this.pendingEvents = [];
    const { maxInputCredits, idleFillAfterTicks, inputJitterBufferTicks: buffer } = this.config.network;
    const movers = () => this.allMovers();
    const crossings: PortalCrossing[] = [];

    for (const player of this.players.values()) {
      if (player.state.hp <= 0) {
        // Frozen while dead: no movement, no attacks, just the respawn countdown.
        if (player.respawnTicksLeft <= 0) player.respawnTicksLeft = this.config.combat.playerRespawnTicks;
        player.respawnTicksLeft -= 1;
        if (player.respawnTicksLeft <= 0) this.respawnPlayer(player);
        continue;
      }

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

      this.drainAttack(player);
    }

    for (const mob of this.mobs.values()) {
      mob.tick({
        world: new PlayerAwareWalkability(this.map, movers, mob.id, mob.rules),
        map: this.map,
        players: this.players,
        emit: (e) => this.pendingEvents.push(e),
        spawnProjectile: (origin, aim, attack, weapon) => this.spawnProjectile(mob.id, false, true, origin, aim, attack, weapon),
      });
    }

    this.advanceProjectiles();
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

  // ---------- combat ----------

  private drainAttack(player: Player): void {
    const input = player.attackQueue.shift();
    if (!input) return;
    if (this.tick - player.lastAttackTick < player.weapon.cooldownTicks) return; // on cooldown: drop silently
    player.lastAttackTick = this.tick;

    const origin = tilePosition(player.state);
    this.pendingEvents.push({ kind: 'attack', sourceId: player.id, aim: input.aim });

    if (player.weapon.kind === 'melee') {
      for (const mob of this.mobs.values()) {
        if (mob.state.hp <= 0) continue;
        if (!meleeHitTest(origin, input.aim, tilePosition(mob.state), player.weapon, this.map)) continue;
        this.applyDamageToMob(player.id, player.combat.attack, mob);
      }
      // PvP: a player's melee weapon can also reach other players.
      for (const other of this.players.values()) {
        if (other.id === player.id || other.state.hp <= 0) continue;
        if (!meleeHitTest(origin, input.aim, tilePosition(other.state), player.weapon, this.map)) continue;
        this.applyDamageToPlayer(player.id, player.combat.attack, other);
      }
    } else {
      // A player's shot can hit mobs and other players; mobs still never fight each other.
      this.spawnProjectile(player.id, true, true, origin, input.aim, player.combat.attack, player.weapon);
    }
  }

  private applyDamageToMob(sourceId: string, attack: number, mob: Mob): void {
    const { damage, crit } = resolveDamage(attack, mob.def.combat?.defense ?? 0);
    mob.state.hp = Math.max(0, mob.state.hp - damage);
    mob.addThreat(sourceId, damage);
    this.pendingEvents.push({ kind: 'hit', sourceId, targetId: mob.id, damage, crit, hpAfter: mob.state.hp });
    if (mob.state.hp <= 0) this.pendingEvents.push({ kind: 'death', sourceId, targetId: mob.id });
  }

  private applyDamageToPlayer(sourceId: string, attack: number, target: Player): void {
    const { damage, crit } = resolveDamage(attack, target.combat.defense);
    target.state.hp = Math.max(0, target.state.hp - damage);
    this.pendingEvents.push({ kind: 'hit', sourceId, targetId: target.id, damage, crit, hpAfter: target.state.hp });
    if (target.state.hp <= 0) this.pendingEvents.push({ kind: 'death', sourceId, targetId: target.id });
  }

  private spawnProjectile(
    sourceId: string,
    canHitMobs: boolean,
    canHitPlayers: boolean,
    origin: { x: number; y: number },
    aim: Direction,
    attack: number,
    weapon: WeaponDefinition,
  ): void {
    const id = `proj:${this.zoneId}:${this.nextProjectileId++}`;
    const speed = weapon.projectileSpeedTilesPerSec ?? 1;
    const projectile = new Projectile(id, sourceId, canHitMobs, canHitPlayers, origin.x, origin.y, aim, attack, speed, weapon.rangeTiles, this.config.simulation.tickRate);
    this.projectiles.set(id, projectile);
    const delta = DIRECTION_DELTAS[aim];
    this.pendingEvents.push({
      kind: 'projectile',
      sourceId,
      aim,
      projectileId: id,
      projectile: { fromX: origin.x, fromY: origin.y, dirX: delta.dx, dirY: delta.dy, speedTilesPerSec: speed, rangeTiles: weapon.rangeTiles },
    });
  }

  private advanceProjectiles(): void {
    for (const [id, projectile] of this.projectiles) {
      const stillAlive = projectile.advance();
      // Walls block arrows/bolts same as melee: a shot that flies into one just vanishes, no hit.
      const blocked = !this.map.isWalkable(Math.round(projectile.x), Math.round(projectile.y));
      const hit = !blocked && this.resolveProjectileHit(projectile);
      if (hit || blocked || !stillAlive) this.projectiles.delete(id);
    }
  }

  private resolveProjectileHit(projectile: Projectile): boolean {
    if (projectile.canHitMobs) {
      for (const mob of this.mobs.values()) {
        if (mob.state.hp <= 0 || !this.withinProjectileRadius(projectile, tilePosition(mob.state))) continue;
        const { damage, crit } = resolveDamage(projectile.attack, mob.def.combat?.defense ?? 0);
        mob.state.hp = Math.max(0, mob.state.hp - damage);
        mob.addThreat(projectile.sourceId, damage);
        this.pendingEvents.push({ kind: 'hit', sourceId: projectile.sourceId, targetId: mob.id, damage, crit, hpAfter: mob.state.hp, projectileId: projectile.id });
        if (mob.state.hp <= 0) this.pendingEvents.push({ kind: 'death', sourceId: projectile.sourceId, targetId: mob.id });
        return true;
      }
    }
    if (projectile.canHitPlayers) {
      for (const player of this.players.values()) {
        if (player.id === projectile.sourceId || player.state.hp <= 0) continue;
        if (!this.withinProjectileRadius(projectile, tilePosition(player.state))) continue;
        const { damage, crit } = resolveDamage(projectile.attack, player.combat.defense);
        player.state.hp = Math.max(0, player.state.hp - damage);
        this.pendingEvents.push({ kind: 'hit', sourceId: projectile.sourceId, targetId: player.id, damage, crit, hpAfter: player.state.hp, projectileId: projectile.id });
        if (player.state.hp <= 0) this.pendingEvents.push({ kind: 'death', sourceId: projectile.sourceId, targetId: player.id });
        return true;
      }
    }
    return false;
  }

  private withinProjectileRadius(projectile: Projectile, target: { x: number; y: number }): boolean {
    return Math.hypot(projectile.x - target.x, projectile.y - target.y) <= PROJECTILE_HIT_RADIUS_TILES;
  }

  private respawnPlayer(player: Player): void {
    const spawn = this.findFreeSpawnTile();
    player.resetAt(spawn.tileX, spawn.tileY, this.config.movement);
    player.state.hp = player.combat.maxHp;
    player.respawnTicksLeft = 0;
    player.lastInputTick = this.tick;
  }

  // ---------- internals ----------

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
