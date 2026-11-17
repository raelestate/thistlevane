/**
 * Skill catalogue (assets/data/skills.json), copied verbatim from the Thistlevane
 * delivery — 270 skills across 18 classes, already validated and balance-checked
 * upstream (see docs/TEST_REPORT.md in the source package). This module only
 * types and validates the shape; the numbers themselves are never recomputed here.
 */
import { ConfigError } from './config';

export type SkillCategory = 'active' | 'passive' | 'utility' | 'ultimate';

export interface SkillEffect {
  damage_type: string | null;
  multiplier: number;
  scaling: string;
  heal_ally_pct: number;
}

export interface SkillAnimation {
  /** null for passives (always-on effects with no cast) — see validateSkills. */
  clip: string | null;
  activate_ms: number;
  hit_ms: number;
  recover_ms: number;
}

export interface Skill {
  id: string;
  class: string;
  name: string;
  level_required: number;
  category: SkillCategory;
  tags: string[];
  target: string;
  range: number;
  radius: number;
  cooldown: number;
  resource: string;
  resource_cost: number;
  resource_gain: number;
  cast_time: number;
  channel: number;
  effect: SkillEffect;
  status: unknown[];
  animation: SkillAnimation;
  /** "<class>/<archetype>" — looked up in the VFX manifest. */
  vfx: string;
  sfx: string[];
  scaling_per_level: string;
  synergies: string[];
  description: string;
  /** "<class>/<slug>.png", relative to assets/icons/skills/. */
  icon: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const posInt = (v: unknown) => Number.isInteger(v) && (v as number) > 0;

export function validateSkills(raw: unknown, source = 'skills.json'): Skill[] {
  if (!Array.isArray(raw)) throw new ConfigError(`${source}: expected an array of skills`);
  const ids = new Set<string>();
  const categories: readonly SkillCategory[] = ['active', 'passive', 'utility', 'ultimate'];
  return raw.map((s, i) => {
    if (!isObj(s) || typeof s.id !== 'string' || !s.id) throw new ConfigError(`${source}[${i}]: missing id`);
    const where = `${source} → ${s.id}`;
    if (ids.has(s.id)) throw new ConfigError(`${where}: duplicate skill id`);
    ids.add(s.id);
    if (typeof s.class !== 'string' || !s.class) throw new ConfigError(`${where}: missing class`);
    if (!posInt(s.level_required)) throw new ConfigError(`${where}: level_required must be a positive integer`);
    if (!categories.includes(s.category as SkillCategory)) throw new ConfigError(`${where}: category must be one of ${categories.join('/')}`);
    if (!isObj(s.effect)) throw new ConfigError(`${where}: missing effect`);
    if (!isObj(s.animation) || (s.animation.clip !== null && (typeof s.animation.clip !== 'string' || !s.animation.clip))) {
      // null is valid (passives have no cast clip); anything else must be a non-empty string.
      throw new ConfigError(`${where}: animation.clip must be a non-empty string or null`);
    }
    if (typeof s.vfx !== 'string' || !s.vfx.includes('/')) throw new ConfigError(`${where}: vfx must be "<class>/<archetype>"`);
    if (typeof s.icon !== 'string' || !s.icon) throw new ConfigError(`${where}: missing icon`);
    return s as unknown as Skill;
  });
}

export function skillsForClass(skills: readonly Skill[], classId: string): Skill[] {
  return skills.filter((s) => s.class === classId).sort((a, b) => a.level_required - b.level_required);
}

/** Every skill a character of `classId` has unlocked by `level` (inclusive), level-ascending. */
export function unlockedSkills(skills: readonly Skill[], classId: string, level: number): Skill[] {
  return skillsForClass(skills, classId).filter((s) => s.level_required <= level);
}
