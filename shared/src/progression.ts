/**
 * Level/XP, now server-authoritative (ported from the old client-only
 * ClientProgression so skill-unlock gating has a real level to check against).
 * This engine does not rescale combat stats by level (see classes.ts) — level
 * only gates which skills are unlocked (data/unlock-schedule.json's levels are
 * already encoded per-skill as `level_required`, so no separate schedule read
 * is needed at runtime).
 */
import type { CombatStats } from './combat';

export function xpForLevel(level: number): number {
  return 80 + level * 40;
}

export function applyXpGain(current: { level: number; xp: number }, defeated: Pick<CombatStats, 'maxHp' | 'attack'>): { level: number; xp: number } {
  let { level, xp } = current;
  xp += Math.round(defeated.maxHp / 4) + defeated.attack;
  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level += 1;
  }
  return { level, xp };
}
