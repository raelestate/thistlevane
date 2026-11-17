import {
  CARDINAL_DIRECTIONS,
  DEFAULT_AGGRO,
  DIRECTION_ANGLES,
  DIRECTION_DELTAS,
  getAggro,
  getWeapon,
  meleeHitTest,
  resolveDamage,
  snapAngleToDirection,
  stepMovement,
  tilePosition,
  type CardinalDirection,
  type CombatEvent,
  type Direction,
  type MobDefinition,
  type MobSpawn,
  type MobState,
  type MovementRules,
  type PlayerState,
  type Walkability,
  type WeaponDefinition,
} from '@thistlevane/shared';
import type { Player } from './Player';

type AiState = 'wander' | 'chase' | 'windup' | 'attack' | 'cooldown' | 'returning';

export interface MobTickContext {
  /** Movement collision (walls + other entities) — for stepping and for "is this tile free to stand on". */
  world: Walkability;
  /** Static map geometry only (no entity occupancy) — for line-of-sight, where the target's own tile must never count as "blocked". */
  map: Walkability;
  players: ReadonlyMap<string, Player>;
  emit: (event: CombatEvent) => void;
  /** Ranged attacks always resolve through World's projectile simulation, whoever fired them. */
  spawnProjectile: (origin: { x: number; y: number }, aim: Direction, attack: number, weapon: WeaponDefinition) => void;
}

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/**
 * A monster: wanders its home region until a player enters its detection
 * range, then chases, telegraphs, attacks, and returns home if it strays too
 * far (leash) or loses its target. Movement reuses the shared grid rules (so
 * mobs respect cliffs, ramps and blocking exactly like players); combat
 * reuses the same geometry/damage primitives player attacks use.
 */
export class Mob {
  /** Movement state in the same shape as a player's, so stepMovement can drive it. */
  readonly state: PlayerState;
  private readonly weapon: WeaponDefinition;
  private readonly aggro: ReturnType<typeof getAggro>;

  private aiState: AiState = 'wander';
  private targetId: string | null = null;
  private windupTicksLeft = 0;
  private cooldownTicksLeft = 0;
  private respawnTicksLeft = 0;
  /** Cumulative damage taken from each player while engaged — the highest holds aggro, not just the nearest. */
  private readonly threat = new Map<string, number>();

  // Wander bookkeeping (unchanged behaviour from the original wander-only mob).
  private pauseTicks: number;
  private stepsLeft = 0;
  private dir: CardinalDirection = 'down';

  constructor(
    readonly id: string,
    /** Key of this mob in mobs.json. */
    readonly kind: string,
    readonly def: MobDefinition,
    readonly home: MobSpawn,
    tileX: number,
    tileY: number,
    private readonly random: () => number,
  ) {
    this.state = {
      id, tileX, tileY, fromX: tileX, fromY: tileY, facing: 'down',
      moveTicksLeft: 0, stepTicks: def.walkTicksPerTile, gait: 'walk', turnTicksLeft: 0,
      hp: def.combat?.maxHp ?? 1, level: 1,
    };
    this.weapon = getWeapon(def);
    const baseAggro = getAggro(def);
    this.aggro = {
      ...baseAggro,
      respawnTicks: home.respawnTicks ?? baseAggro.respawnTicks,
      corpseTicks: home.corpseTicks ?? baseAggro.corpseTicks ?? DEFAULT_AGGRO.corpseTicks!,
    };
    this.pauseTicks = this.randomPause();
  }

  /** Movement rules for this mob: its own speed, no turn delay, blocks others. */
  get rules(): MovementRules {
    return { walkTicksPerTile: this.def.walkTicksPerTile, runTicksPerTile: this.def.walkTicksPerTile, turnDelayTicks: 0, playersBlockEachOther: true };
  }

  get aiStateName(): string {
    return this.aiState;
  }

  /** False once a corpse's brief on-screen window has elapsed — it drops out of snapshots
   * entirely until it respawns, instead of lingering visibly for the whole respawn countdown. */
  get isVisible(): boolean {
    if (this.state.hp > 0) return true;
    const corpseTicks = this.aggro.corpseTicks ?? DEFAULT_AGGRO.corpseTicks!;
    return this.aggro.respawnTicks - this.respawnTicksLeft < corpseTicks;
  }

  /** Called by World whenever a player's attack (melee or projectile) lands on this mob. */
  addThreat(playerId: string, amount: number): void {
    this.threat.set(playerId, (this.threat.get(playerId) ?? 0) + amount);
  }

  tick(ctx: MobTickContext): void {
    const s = this.state;
    if (s.hp <= 0) {
      // Dead: stays visible at hp 0 (client already renders that), counts down, then respawns in home.
      if (this.respawnTicksLeft <= 0) this.respawnTicksLeft = this.aggro.respawnTicks;
      this.respawnTicksLeft -= 1;
      if (this.respawnTicksLeft <= 0) this.respawnAtHome(ctx.world);
      return;
    }
    switch (this.aiState) {
      case 'wander': return this.tickWander(ctx);
      case 'chase': return this.tickChase(ctx);
      case 'windup': return this.tickWindup(ctx);
      case 'attack': return this.tickAttack(ctx);
      case 'cooldown': return this.tickCooldown(ctx);
      case 'returning': return this.tickReturning(ctx);
    }
  }

  snapshot(): MobState {
    const s = this.state;
    return {
      id: this.id, kind: this.kind, tileX: s.tileX, tileY: s.tileY, fromX: s.fromX, fromY: s.fromY,
      facing: s.facing, moveTicksLeft: s.moveTicksLeft, stepTicks: s.stepTicks, hp: s.hp, aiState: this.aiState,
    };
  }

  // ---------- state handlers ----------

  private tickWander(ctx: MobTickContext): void {
    const target = this.findTarget(ctx.players.values(), this.aggro.detectionRangeTiles);
    if (target) {
      this.targetId = target.id;
      this.aiState = 'chase';
      this.stepsLeft = 0;
      ctx.emit({ kind: 'aggro', sourceId: this.id, targetId: target.id });
      return;
    }
    this.wanderStep(ctx.world);
  }

  private tickChase(ctx: MobTickContext): void {
    const target = this.findTarget(ctx.players.values(), this.aggro.detectionRangeTiles);
    if (!target) {
      this.aiState = 'returning';
      this.targetId = null;
      return;
    }
    this.targetId = target.id;

    const s = this.state;
    const origin = tilePosition(s);
    const targetPos = tilePosition(target.state);
    const distance = Math.hypot(targetPos.x - origin.x, targetPos.y - origin.y);
    const aim = snapAngleToDirection(targetPos.x - origin.x, targetPos.y - origin.y);

    if (distance <= this.weapon.rangeTiles) {
      this.aiState = 'windup';
      this.windupTicksLeft = this.aggro.attackWindupTicks;
      s.facing = aim;
      ctx.emit({ kind: 'windup', sourceId: this.id, targetId: target.id, aim });
      return;
    }

    const delta = DIRECTION_DELTAS[aim];
    const home = this.homeCenter;
    if (chebyshev(s.tileX + delta.dx, s.tileY + delta.dy, home.x, home.y) > this.aggro.leashRangeTiles) {
      this.aiState = 'returning';
      this.targetId = null;
      return;
    }
    stepMovement(s, { dir: aim, run: false }, ctx.world, this.rules);
  }

  private tickWindup(ctx: MobTickContext): void {
    const target = this.targetId ? ctx.players.get(this.targetId) : undefined;
    if (!target || target.state.hp <= 0) {
      this.aiState = 'returning';
      this.targetId = null;
      return;
    }
    this.windupTicksLeft -= 1;
    if (this.windupTicksLeft <= 0) this.aiState = 'attack';
  }

  /** Damage ties to this exact moment — never to animation start. */
  private tickAttack(ctx: MobTickContext): void {
    const target = this.targetId ? ctx.players.get(this.targetId) : undefined;
    if (target && target.state.hp > 0) {
      const origin = tilePosition(this.state);
      const targetPos = tilePosition(target.state);
      const aim = snapAngleToDirection(targetPos.x - origin.x, targetPos.y - origin.y);
      this.state.facing = aim;
      ctx.emit({ kind: 'attack', sourceId: this.id, targetId: target.id, aim });
      const attack = this.def.combat?.attack ?? 0;
      const distance = Math.hypot(targetPos.x - origin.x, targetPos.y - origin.y);
      if (distance <= this.weapon.rangeTiles) {
        if (this.weapon.kind === 'melee') {
          if (meleeHitTest(origin, DIRECTION_ANGLES[aim], targetPos, this.weapon, ctx.map)) this.applyDamageTo(target, attack, ctx);
        } else {
          ctx.spawnProjectile(origin, aim, attack, this.weapon);
        }
      }
    }
    this.aiState = 'cooldown';
    this.cooldownTicksLeft = this.weapon.cooldownTicks;
  }

  private tickCooldown(ctx: MobTickContext): void {
    this.cooldownTicksLeft -= 1;
    if (this.cooldownTicksLeft > 0) return;

    const target = this.findTarget(ctx.players.values(), this.aggro.detectionRangeTiles);
    if (!target) {
      this.aiState = 'returning';
      this.targetId = null;
      return;
    }
    this.targetId = target.id;
    const origin = tilePosition(this.state);
    const targetPos = tilePosition(target.state);
    const distance = Math.hypot(targetPos.x - origin.x, targetPos.y - origin.y);
    if (distance <= this.weapon.rangeTiles) {
      this.aiState = 'windup';
      this.windupTicksLeft = this.aggro.attackWindupTicks;
      const aim = snapAngleToDirection(targetPos.x - origin.x, targetPos.y - origin.y);
      this.state.facing = aim;
      ctx.emit({ kind: 'windup', sourceId: this.id, targetId: target.id, aim });
    } else {
      this.aiState = 'chase';
    }
  }

  private tickReturning(ctx: MobTickContext): void {
    const s = this.state;
    if (this.inHome(s.tileX, s.tileY)) {
      this.aiState = 'wander';
      this.stepsLeft = 0;
      this.pauseTicks = this.randomPause();
      this.threat.clear(); // fully disengaged: old grudges don't carry into the next encounter
      return;
    }
    const origin = tilePosition(s);
    const home = this.homeCenter;
    const dir = snapAngleToDirection(home.x - origin.x, home.y - origin.y);
    stepMovement(s, { dir, run: false }, ctx.world, this.rules);
  }

  // ---------- combat helpers ----------

  private applyDamageTo(target: Player, attack: number, ctx: MobTickContext): void {
    const { damage, crit } = resolveDamage(attack, target.combat.defense);
    target.state.hp = Math.max(0, target.state.hp - damage);
    ctx.emit({ kind: 'hit', sourceId: this.id, targetId: target.id, damage, crit, hpAfter: target.state.hp });
    if (target.state.hp <= 0) ctx.emit({ kind: 'death', sourceId: this.id, targetId: target.id });
  }

  /**
   * Who to target among players within `maxDistance`: whoever has dealt the
   * most cumulative damage so far (so a tank who keeps swinging holds aggro
   * over a squishier ally), falling back to nearest for a first, undamaged
   * encounter.
   */
  private findTarget(players: Iterable<Player>, maxDistance: number): Player | null {
    const origin = tilePosition(this.state);
    let byThreat: Player | null = null;
    let bestThreat = 0;
    let byDistance: Player | null = null;
    let bestDistance = Infinity;
    for (const p of players) {
      if (p.state.hp <= 0) continue;
      const pos = tilePosition(p.state);
      const distance = Math.hypot(pos.x - origin.x, pos.y - origin.y);
      if (distance > maxDistance) continue;
      if (distance < bestDistance) {
        bestDistance = distance;
        byDistance = p;
      }
      const threat = this.threat.get(p.id) ?? 0;
      if (threat > bestThreat) {
        bestThreat = threat;
        byThreat = p;
      }
    }
    return byThreat ?? byDistance;
  }

  private get homeCenter(): { x: number; y: number } {
    return { x: this.home.x + this.home.w / 2, y: this.home.y + this.home.h / 2 };
  }

  private respawnAtHome(world: Walkability): void {
    let x = this.home.x;
    let y = this.home.y;
    for (let tries = 0; tries < 20; tries++) {
      const cx = this.home.x + Math.floor(this.random() * this.home.w);
      const cy = this.home.y + Math.floor(this.random() * this.home.h);
      if (world.isWalkable(cx, cy)) {
        x = cx;
        y = cy;
        break;
      }
    }
    const s = this.state;
    s.tileX = x; s.tileY = y; s.fromX = x; s.fromY = y;
    s.moveTicksLeft = 0; s.turnTicksLeft = 0; s.gait = 'walk'; s.stepTicks = this.def.walkTicksPerTile;
    s.hp = this.def.combat?.maxHp ?? 1;
    this.aiState = 'wander';
    this.targetId = null;
    this.threat.clear();
    this.stepsLeft = 0;
    this.pauseTicks = this.randomPause();
  }

  // ---------- wander (unchanged behaviour) ----------

  private wanderStep(world: Walkability): void {
    const s = this.state;
    if (s.moveTicksLeft > 0) {
      // Mid-step: finish it, chaining straight into the next step while the walk continues inside home.
      const next = this.ahead(s.tileX, s.tileY);
      const wantMore = this.stepsLeft > 0 && this.inHome(next.x, next.y);
      const outcome = stepMovement(s, { dir: wantMore ? this.dir : null, run: false }, world, this.rules);
      if (outcome.kind === 'started') this.stepsLeft -= 1;
      else if (s.moveTicksLeft === 0) {
        // arrived and did not continue (walk over, left home, or blocked): rest a while
        this.stepsLeft = 0;
        this.pauseTicks = this.randomPause();
      }
      return;
    }
    if (this.pauseTicks > 0) {
      this.pauseTicks -= 1;
      return;
    }
    if (this.stepsLeft <= 0) this.chooseWander();
    const target = this.ahead(s.tileX, s.tileY);
    if (!this.inHome(target.x, target.y)) {
      this.stepsLeft = 0;
      this.pauseTicks = Math.max(3, this.randomPause() >> 2);
      return;
    }
    const outcome = stepMovement(s, { dir: this.dir, run: false }, world, this.rules);
    if (outcome.kind === 'started') this.stepsLeft -= 1;
    else {
      this.stepsLeft = 0;
      this.pauseTicks = Math.max(5, this.randomPause() >> 1);
    }
  }

  private chooseWander(): void {
    this.dir = CARDINAL_DIRECTIONS[Math.floor(this.random() * CARDINAL_DIRECTIONS.length)]!;
    this.stepsLeft = 1 + Math.floor(this.random() * this.def.wander.maxSteps);
  }

  private ahead(x: number, y: number): { x: number; y: number } {
    const d = DIRECTION_DELTAS[this.dir];
    return { x: x + d.dx, y: y + d.dy };
  }

  private inHome(x: number, y: number): boolean {
    return x >= this.home.x && x < this.home.x + this.home.w && y >= this.home.y && y < this.home.y + this.home.h;
  }

  private randomPause(): number {
    const { pauseTicksMin, pauseTicksMax } = this.def.wander;
    return pauseTicksMin + Math.floor(this.random() * (pauseTicksMax - pauseTicksMin + 1));
  }
}
