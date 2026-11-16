import type { CombatStats } from '@thistlevane/shared';

/**
 * Level/XP bookkeeping only. Fed exclusively by server 'death' events where
 * the local player was the source — never local RNG. Damage/HP/crit all come
 * from the server now; this is the one piece of combat state that still has
 * no server-side equivalent (no levelling system exists yet).
 */
export class ClientProgression {
  level = 1;
  xp = 0;

  get xpForLevel(): number {
    return 80 + this.level * 40;
  }

  awardXp(defeated: CombatStats): void {
    this.xp += Math.round(defeated.maxHp / 4) + defeated.attack;
    while (this.xp >= this.xpForLevel) {
      this.xp -= this.xpForLevel;
      this.level += 1;
    }
  }
}
