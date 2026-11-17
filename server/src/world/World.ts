import {
  DIRECTION_ANGLES,
  DIRECTION_DELTAS,
  PlayerAwareWalkability,
  applyXpGain,
  clonePlayerState,
  hasLineOfSight,
  meleeHitTest,
  occupiesTile,
  resolveDamage,
  snapAngleToDirection,
  stepMovement,
  tilePosition,
  withinRadius,
  xpForLevel,
  type CombatEvent,
  type CombatStats,
  type Direction,
  type GameConfig,
  type MapModel,
  type MobCatalog,
  type MobState,
  type MoveIntent,
  type Mover,
  type PlayerPrivateState,
  type PlayerState,
  type Portal,
  type Skill,
  type WeaponDefinition,
} from '@thistlevane/shared';
import { Mob } from './Mob';
import { Player, type QueuedAttack, type QueuedCast } from './Player';
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
  /** O(1) skill lookup by id — playerPrivateState/drainCast run every tick per player, so this
   * avoids scanning the full 270-skill catalogue that often (see the loop-timing note below). */
  private readonly skillsById: ReadonlyMap<string, Skill>;

  constructor(
    readonly zoneId: string,
    readonly map: MapModel,
    private readonly config: GameConfig,
    mobCatalog: MobCatalog,
    skills: Skill[],
    seed = 1,
  ) {
    this.random = mulberry32(seed);
    this.skillsById = new Map(skills.map((s) => [s.id, s]));
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
  queueAttack(playerId: string, seq: number, aim: Direction, targetId?: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    if (seq <= player.lastQueuedAttackSeq) return;
    player.lastQueuedAttackSeq = seq;
    if (player.attackQueue.length >= this.config.network.maxQueuedInputs) return;
    player.attackQueue.push({ seq, aim, targetId, arrivedTick: this.tick });
  }

  /**
   * Accept one skill-cast attempt. Deduped by its own seq, independent of movement/attack input.
   * `aim` is the snapped Direction (still used for the broadcast CombatEvent, i.e. which way the
   * caster visually faces/animates); `aimDeg` is the real, continuous angle the client was
   * actually pointed at, used for the hit-test math — see applySkillEffect.
   */
  queueCast(playerId: string, seq: number, skillId: string, aim: Direction, aimDeg: number, targetId?: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    if (seq <= player.lastQueuedCastSeq) return;
    player.lastQueuedCastSeq = seq;
    if (player.castQueue.length >= this.config.network.maxQueuedInputs) return;
    player.castQueue.push({ seq, skillId, aim, aimDeg, targetId, arrivedTick: this.tick });
  }

  /**
   * Per-connection data never broadcast to other clients — see ConnectionManager. Called every
   * tick for every connected player, so this only ever iterates `player.skillCooldowns` (at most
   * a handful of entries — the skills actually on cooldown right now), never the full catalogue.
   */
  playerPrivateState(player: Player): PlayerPrivateState {
    const tickRate = this.config.simulation.tickRate;
    const cooldownsMs: Record<string, number> = {};
    for (const [skillId, lastUsed] of player.skillCooldowns) {
      const skill = this.skillsById.get(skillId);
      if (!skill) continue;
      const cooldownTicks = Math.max(1, Math.round(skill.cooldown * tickRate));
      const remainingTicks = cooldownTicks - (this.tick - lastUsed);
      if (remainingTicks > 0) cooldownsMs[skillId] = Math.round((remainingTicks * 1000) / tickRate);
    }
    return { xp: player.xp, xpForLevel: xpForLevel(player.level), resourceCurrent: player.resourceCurrent, resourceMax: 100, cooldownsMs };
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
      this.drainCast(player);
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
    return [...this.mobs.values()].filter((m) => m.isVisible).map((m) => m.snapshot());
  }

  /** Players and mobs within `radius` tiles (Chebyshev) of a point. */
  nearby(tileX: number, tileY: number, radius: number): { players: PlayerState[]; mobs: MobState[] } {
    const near = (s: Mover) => Math.abs(s.tileX - tileX) <= radius && Math.abs(s.tileY - tileY) <= radius;
    const players: PlayerState[] = [];
    for (const p of this.players.values()) if (near(p.state)) players.push(clonePlayerState(p.state));
    const mobs: MobState[] = [];
    for (const m of this.mobs.values()) if (m.isVisible && near(m.state)) mobs.push(m.snapshot());
    return { players, mobs };
  }

  // ---------- combat ----------

  private drainAttack(player: Player): void {
    const input = player.attackQueue.shift();
    if (!input) return;
    if (this.tick - player.lastAttackTick < player.weapon.cooldownTicks) return; // on cooldown: drop silently
    player.lastAttackTick = this.tick;

    const origin = tilePosition(player.state);
    const aim = this.resolveAttackAim(origin, input);
    this.pendingEvents.push({ kind: 'attack', sourceId: player.id, aim });

    if (player.weapon.kind === 'melee') {
      for (const mob of this.mobs.values()) {
        if (mob.state.hp <= 0) continue;
        if (!meleeHitTest(origin, DIRECTION_ANGLES[aim], tilePosition(mob.state), player.weapon, this.map)) continue;
        this.applyDamageToMob(player.id, player.combat.attack, mob);
      }
      // PvP: a player's melee weapon can also reach other players.
      for (const other of this.players.values()) {
        if (other.id === player.id || other.state.hp <= 0) continue;
        if (!meleeHitTest(origin, DIRECTION_ANGLES[aim], tilePosition(other.state), player.weapon, this.map)) continue;
        this.applyDamageToPlayer(player.id, player.combat.attack, other);
      }
    } else {
      // A player's shot can hit mobs and other players; mobs still never fight each other.
      this.spawnProjectile(player.id, true, true, origin, aim, player.combat.attack, player.weapon);
    }
  }

  /**
   * The direction a swing/shot is actually aimed. With a live `targetId`, recompute it from the
   * real attacker→target vector — exactly how a mob already aims at a player every tick — so
   * the swing lands regardless of which way the attacker's claimed facing happens to be. Falls
   * back to the client-claimed `aim` with no `targetId`, or if the named target has died/left
   * since the click. This can never bypass range/LOS: meleeHitTest and projectile resolution
   * still check the target's real position independently of whatever direction was claimed.
   */
  private resolveAttackAim(origin: { x: number; y: number }, input: { aim: Direction; targetId?: string }): Direction {
    if (!input.targetId) return input.aim;
    const mob = this.mobs.get(input.targetId);
    if (mob && mob.state.hp > 0) {
      const pos = tilePosition(mob.state);
      return snapAngleToDirection(pos.x - origin.x, pos.y - origin.y);
    }
    const other = this.players.get(input.targetId);
    if (other && other.state.hp > 0) {
      const pos = tilePosition(other.state);
      return snapAngleToDirection(pos.x - origin.x, pos.y - origin.y);
    }
    return input.aim;
  }

  /**
   * Resolves one queued skill cast. Server-authoritative on every gate: class ownership,
   * unlock level, cooldown and resource cost. Mirrors drainAttack's shape; damage/heal numbers
   * reuse the exact same resolveDamage/HP pipeline so a skill's `effect.multiplier` just scales
   * the attacker's existing `attack` stat rather than replacing this engine's damage formula —
   * see shared/src/classes.ts and the integration notes for why.
   */
  private drainCast(player: Player): void {
    const input = player.castQueue.shift();
    if (!input) return;
    const skill = this.skillsById.get(input.skillId);
    if (!skill || skill.class !== player.characterId) return; // unknown skill, or doesn't belong to this player's class: silently ignored
    if (skill.category === 'passive') return; // always-on traits have no activation to request
    if (player.level < skill.level_required) return; // not unlocked yet
    const cooldownTicks = Math.max(1, Math.round(skill.cooldown * this.config.simulation.tickRate));
    const lastUsed = player.skillCooldowns.get(skill.id) ?? -Infinity;
    if (this.tick - lastUsed < cooldownTicks) return; // still on cooldown: drop silently
    if (skill.resource_cost > player.resourceCurrent) return; // can't afford

    player.skillCooldowns.set(skill.id, this.tick);
    player.resourceCurrent = Math.max(0, Math.min(100, player.resourceCurrent - skill.resource_cost + skill.resource_gain));

    const origin = tilePosition(player.state);
    const aim = this.resolveAttackAim(origin, input); // Direction, for the broadcast event (facing/animation) only
    this.pendingEvents.push({ kind: 'cast', sourceId: player.id, aim, skillId: skill.id, targetId: input.targetId });
    this.applySkillEffect(player, skill, origin, input.aimDeg, input.targetId);
  }

  /**
   * Applies what a skill's own data can mechanically express today: damage (effect.multiplier)
   * or healing (effect.heal_ally_pct). Status effects (crowd control, buffs/stances, summons) in
   * skill.status[] are NOT applied — this engine has no status-effect/summon subsystem yet, and
   * building one was out of scope for this integration pass (see the final report).
   *
   * Targeting is free-aim, not grid-snapped: `aimDeg` is the real angle the client was pointed
   * at (not one of the 8 rendered directions), and range/radius are true continuous distance —
   * movement stays tile-based, but a skill's reach never does. A locked `targetId` always wins
   * when it's alive and in range (tab-target precision shouldn't depend on exact mouse angle);
   * `aimDeg` only drives a free "skillshot" when no target is locked.
   */
  private applySkillEffect(caster: Player, skill: Skill, origin: { x: number; y: number }, aimDeg: number, targetId?: string): void {
    if (skill.effect.heal_ally_pct > 0) {
      const healTarget = this.resolveHealTarget(caster, targetId);
      if (healTarget) this.applyHeal(caster.id, healTarget, skill.effect.heal_ally_pct);
      return;
    }
    if (skill.effect.multiplier <= 0) return; // pure buff/passive/utility: cast event + animation/VFX only

    const attackPower = caster.combat.attack * skill.effect.multiplier;
    const range = skill.range > 0 ? skill.range : 1.5;

    // skills.json's own target strings are 'single_enemy' | 'self' | 'area_enemy' | 'ally_or_self'
    // — not 'aoe' (an earlier guess here never actually matched, so every area skill was silently
    // routed through the single-target branch below; fixed here, verified against the real data).
    if (skill.target === 'area_enemy') {
      const center = this.resolveAoeCenter(origin, aimDeg, range, targetId);
      const radius = skill.radius > 0 ? skill.radius : range;
      for (const mob of this.mobs.values()) {
        if (mob.state.hp <= 0) continue;
        const pos = tilePosition(mob.state);
        if (!withinRadius(center, pos, radius) || !hasLineOfSight(origin, pos, this.map)) continue;
        this.applyDamageToMob(caster.id, attackPower, mob);
      }
      for (const other of this.players.values()) {
        if (other.id === caster.id || other.state.hp <= 0) continue;
        const pos = tilePosition(other.state);
        if (!withinRadius(center, pos, radius) || !hasLineOfSight(origin, pos, this.map)) continue;
        this.applyDamageToPlayer(caster.id, attackPower, other);
      }
      return;
    }

    if (targetId) {
      const mob = this.mobs.get(targetId);
      if (mob && mob.state.hp > 0 && this.canReach(origin, tilePosition(mob.state), range)) {
        this.applyDamageToMob(caster.id, attackPower, mob);
        return;
      }
      const other = this.players.get(targetId);
      if (other && other.id !== caster.id && other.state.hp > 0 && this.canReach(origin, tilePosition(other.state), range)) {
        this.applyDamageToPlayer(caster.id, attackPower, other);
        return;
      }
      return; // named target died/left/moved out of range since the click: the cast still happened, it just whiffs
    }

    // No lock: a free skillshot in whatever direction was actually aimed (continuous, not snapped).
    const reach: WeaponDefinition = { kind: 'melee', rangeTiles: range, arcDegrees: 70, cooldownTicks: 0 };
    for (const mob of this.mobs.values()) {
      if (mob.state.hp <= 0) continue;
      if (!meleeHitTest(origin, aimDeg, tilePosition(mob.state), reach, this.map)) continue;
      this.applyDamageToMob(caster.id, attackPower, mob);
      return;
    }
    for (const other of this.players.values()) {
      if (other.id === caster.id || other.state.hp <= 0) continue;
      if (!meleeHitTest(origin, aimDeg, tilePosition(other.state), reach, this.map)) continue;
      this.applyDamageToPlayer(caster.id, attackPower, other);
      return;
    }
  }

  private canReach(origin: { x: number; y: number }, target: { x: number; y: number }, range: number): boolean {
    return withinRadius(origin, target, range) && hasLineOfSight(origin, target, this.map);
  }

  /** Where an AoE actually lands: centered on a locked, reachable target if there is one
   * (matches how tab-targeted AoE works in most MMOs), otherwise a point `range` tiles out
   * along the real aim angle — a skillshot blast, not "everything near me". */
  private resolveAoeCenter(origin: { x: number; y: number }, aimDeg: number, range: number, targetId?: string): { x: number; y: number } {
    if (targetId) {
      const mob = this.mobs.get(targetId);
      if (mob && mob.state.hp > 0 && this.canReach(origin, tilePosition(mob.state), range)) return tilePosition(mob.state);
      const other = this.players.get(targetId);
      if (other && other.state.hp > 0 && this.canReach(origin, tilePosition(other.state), range)) return tilePosition(other.state);
    }
    const rad = (aimDeg * Math.PI) / 180;
    return { x: origin.x + Math.cos(rad) * range, y: origin.y + Math.sin(rad) * range };
  }

  /** No party/friendly-targeting system exists yet, so an ally heal only ever reaches a live,
   * explicitly-targeted player, falling back to the caster themself (self-heal is always valid). */
  private resolveHealTarget(caster: Player, targetId?: string): Player | null {
    if (targetId) {
      const target = this.players.get(targetId);
      if (target && target.state.hp > 0) return target;
    }
    return caster.state.hp > 0 ? caster : null;
  }

  private applyHeal(sourceId: string, target: Player, healAllyPct: number): void {
    const healing = Math.round(target.combat.maxHp * healAllyPct);
    target.state.hp = Math.min(target.combat.maxHp, target.state.hp + healing);
    this.pendingEvents.push({ kind: 'heal', sourceId, targetId: target.id, healing, hpAfter: target.state.hp });
  }

  private applyDamageToMob(sourceId: string, attack: number, mob: Mob): void {
    const { damage, crit } = resolveDamage(attack, mob.def.combat?.defense ?? 0);
    mob.state.hp = Math.max(0, mob.state.hp - damage);
    mob.addThreat(sourceId, damage);
    this.pendingEvents.push({ kind: 'hit', sourceId, targetId: mob.id, damage, crit, hpAfter: mob.state.hp });
    if (mob.state.hp <= 0) {
      this.pendingEvents.push({ kind: 'death', sourceId, targetId: mob.id });
      this.awardXp(sourceId, mob.def.combat);
    }
  }

  /** Mob kills only (matches the old client-only progression's behaviour) — PvP grants no XP. */
  private awardXp(sourceId: string, defeated: CombatStats | undefined): void {
    if (!defeated) return;
    const player = this.players.get(sourceId);
    if (!player) return;
    const { level, xp } = applyXpGain({ level: player.level, xp: player.xp }, defeated);
    player.level = level;
    player.xp = xp;
    player.state.level = level;
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
    player.resourceCurrent = 100;
    player.respawnTicksLeft = 0;
    player.lastInputTick = this.tick;
  }

  // ---------- internals ----------

  /** Dead players/mobs never occupy a tile — a corpse must not block movement, chase pathing, or spawn placement. */
  private *allMovers(): Iterable<Mover> {
    for (const p of this.players.values()) if (p.state.hp > 0) yield p.state;
    for (const m of this.mobs.values()) if (m.state.hp > 0) yield m.state;
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
