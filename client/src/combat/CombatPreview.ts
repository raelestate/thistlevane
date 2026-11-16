import type { CombatStats } from '@thistlevane/shared';

/**
 * CLIENT-SIDE COMBAT PREVIEW.
 *
 * The server has no combat system yet (Milestone 4), so nothing in here is
 * authoritative: it exists so the MMORPG interface — target frame, damage
 * numbers, hit flashes, cooldowns, XP — can be seen and judged in the real
 * game. Mob health lives only in this browser tab and resets when the mob
 * leaves interest range or the zone is rebuilt. When server combat arrives,
 * this class is the seam: replace `resolveAttack` with the server's results
 * and delete the local health book-keeping.
 */

export const ATTACK_COOLDOWN_MS = 650;
export const ATTACK_MP_COST = 6;
const MP_REGEN_PER_SEC = 5;
/** You can only hit something on your own tile or the eight around it. */
export const ATTACK_RANGE_TILES = 1.5;

export interface AttackResult {
  damage: number;
  crit: boolean;
  defeated: boolean;
  hpAfter: number;
}

export class CombatPreview {
  /** Local health of each mob instance, keyed by the server's mob id. */
  private readonly mobHp = new Map<string, number>();
  private lastAttackAt = -Infinity;

  targetId: string | null = null;
  mp: number;
  readonly maxMp: number;
  hp: number;
  readonly maxHp: number;
  level = 1;
  xp = 0;

  constructor(
    private readonly stats: CombatStats,
    private readonly now: () => number,
  ) {
    this.hp = stats.maxHp;
    this.maxHp = stats.maxHp;
    this.mp = stats.maxMp;
    this.maxMp = stats.maxMp;
  }

  get xpForLevel(): number {
    return 80 + this.level * 40;
  }

  /** Mana ticks back up between swings. */
  tick(deltaMs: number): void {
    this.mp = Math.min(this.maxMp, this.mp + (MP_REGEN_PER_SEC * deltaMs) / 1000);
  }

  cooldownProgress(): number {
    return Math.min(1, (this.now() - this.lastAttackAt) / ATTACK_COOLDOWN_MS);
  }

  canAttack(): boolean {
    return this.cooldownProgress() >= 1 && this.mp >= ATTACK_MP_COST;
  }

  /** Call once the swing is committed (the animation plays even if nothing is in range). */
  beginAttack(): void {
    this.lastAttackAt = this.now();
    this.mp = Math.max(0, this.mp - ATTACK_MP_COST);
  }

  hpOf(mobId: string, maxHp: number): number {
    const current = this.mobHp.get(mobId);
    return current === undefined ? maxHp : current;
  }

  isDefeated(mobId: string): boolean {
    return (this.mobHp.get(mobId) ?? 1) <= 0;
  }

  forget(mobId: string): void {
    this.mobHp.delete(mobId);
    if (this.targetId === mobId) this.targetId = null;
  }

  clear(): void {
    this.mobHp.clear();
    this.targetId = null;
  }

  /** Rolls one hit against a mob and books the damage locally. */
  resolveAttack(mobId: string, defender: CombatStats): AttackResult {
    const roll = 0.85 + Math.random() * 0.3;
    const crit = Math.random() < 0.12;
    const raw = this.stats.attack * roll * (crit ? 1.8 : 1) - defender.defense * 0.5;
    const damage = Math.max(1, Math.round(raw));
    const hpAfter = Math.max(0, this.hpOf(mobId, defender.maxHp) - damage);
    this.mobHp.set(mobId, hpAfter);
    if (hpAfter === 0) this.awardXp(defender);
    return { damage, crit, defeated: hpAfter === 0, hpAfter };
  }

  private awardXp(defeated: CombatStats): void {
    this.xp += Math.round(defeated.maxHp / 4) + defeated.attack;
    while (this.xp >= this.xpForLevel) {
      this.xp -= this.xpForLevel;
      this.level += 1;
    }
  }
}
