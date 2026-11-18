/**
 * Adapter for the Thistlevane character package: parses each class's
 * animations/<class>.json (explicit per-frame rects + per-frame durations_ms +
 * attach points, as delivered) into this engine's own Direction keys, and
 * combines it with data/classes.json + a class's level-1 skill into a
 * CharacterDefinition this engine's content/rendering code can consume.
 *
 * Nothing here regenerates or restructures the delivered art or JSON — it only
 * reads the files as-is and reshapes the result in memory.
 */
import { ConfigError } from './config';
import { DEFAULT_WEAPON, type CombatStats, type WeaponDefinition } from './combat';
import { DIRECTIONS, type Direction } from './protocol';
import type { Skill } from './skills';

/** Thistlevane's own 8-direction row order → this engine's Direction names (see DESIGN.md §3.2). */
export const THISTLEVANE_DIRECTION_MAP: Record<string, Direction> = {
  s: 'down', sw: 'down-left', w: 'left', nw: 'up-left',
  n: 'up', ne: 'up-right', e: 'right', se: 'down-right',
};

export interface SpriteFrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type AttachKey = 'hand_r' | 'hand_l' | 'head_top' | 'chest' | 'foot_l' | 'foot_r';
/** [x, y, depth] in frame pixels; smaller depth = nearer the camera. */
export type AttachPoint = [number, number, number];
export type AttachFrame = Partial<Record<AttachKey, AttachPoint>>;

export interface RichClip {
  frames: number;
  loop: boolean;
  durationsMs: number[];
  /** Filename only (e.g. "arcanist_idle.png") — this clip's own strip, a sibling of this
   * class's animations/<class>.json (see classAnimationImagePath). v2 gives every clip,
   * locomotion or combat, its own strip; there's no combined per-kind sheet to pick between. */
  image: string;
  rects: Record<Direction, SpriteFrameRect[]>;
  attach?: Record<Direction, AttachFrame[]>;
}

export interface ParsedClassAnimations {
  frameWidth: number;
  frameHeight: number;
  /** Normalized (0-1) — the ground point between the feet, same convention this engine already uses. */
  anchor: { x: number; y: number };
  clips: Record<string, RichClip>;
  signatureClips: string[];
  combatClips: string[];
  /** Reference only (see classes.ts README note below) — not used to vary actual tile movement speed. */
  movementSpeedPxPerS: { walk: number; run: number };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Parses one class's animations/<class>.json exactly as delivered — explicit frame rects and
 * per-frame durations are trusted verbatim, never recomputed from a column/row grid. */
export function parseClassAnimations(raw: unknown, classId: string): ParsedClassAnimations {
  if (!isObj(raw)) throw new ConfigError(`${classId}.json: expected an object`);
  const frame = raw.frame;
  if (!isObj(frame) || !isObj(frame.anchor) || typeof frame.width !== 'number' || typeof frame.height !== 'number') {
    throw new ConfigError(`${classId}.json: missing frame.width/height/anchor`);
  }
  const anchorPx = frame.anchor as Record<string, unknown>;
  if (typeof anchorPx.x !== 'number' || typeof anchorPx.y !== 'number') {
    throw new ConfigError(`${classId}.json: frame.anchor must have numeric x/y`);
  }
  const frameWidth = frame.width;
  const frameHeight = frame.height;
  const anchor = { x: anchorPx.x / frameWidth, y: anchorPx.y / frameHeight };

  const animations = raw.animations;
  if (!isObj(animations)) throw new ConfigError(`${classId}.json: missing animations`);

  const clips: Record<string, RichClip> = {};
  for (const [name, value] of Object.entries(animations)) {
    if (!isObj(value)) throw new ConfigError(`${classId}.json: animation "${name}" must be an object`);
    const frames = value.frames;
    const durationsMs = value.durations_ms;
    if (!Number.isInteger(frames) || (frames as number) <= 0) {
      throw new ConfigError(`${classId}.json: animation "${name}" needs a positive "frames"`);
    }
    if (!Array.isArray(durationsMs) || durationsMs.length !== frames) {
      throw new ConfigError(`${classId}.json: animation "${name}" durations_ms must have ${frames} entries`);
    }
    const dirsRaw = value.directions;
    if (!isObj(dirsRaw)) throw new ConfigError(`${classId}.json: animation "${name}" missing directions`);

    const rects = {} as Record<Direction, SpriteFrameRect[]>;
    for (const [tDir, engineDir] of Object.entries(THISTLEVANE_DIRECTION_MAP)) {
      const list = dirsRaw[tDir];
      if (!Array.isArray(list) || list.length !== frames) {
        throw new ConfigError(`${classId}.json: animation "${name}" direction "${tDir}" needs ${frames} frame rects`);
      }
      rects[engineDir] = list.map((r: unknown) => {
        if (!isObj(r) || typeof r.x !== 'number' || typeof r.y !== 'number' || typeof r.w !== 'number' || typeof r.h !== 'number') {
          throw new ConfigError(`${classId}.json: animation "${name}" direction "${tDir}" has a malformed frame rect`);
        }
        return { x: r.x, y: r.y, w: r.w, h: r.h };
      });
    }

    let attach: Record<Direction, AttachFrame[]> | undefined;
    if (isObj(value.attach)) {
      const attachRaw = value.attach;
      const built = {} as Record<Direction, AttachFrame[]>;
      for (const [tDir, engineDir] of Object.entries(THISTLEVANE_DIRECTION_MAP)) {
        const list = attachRaw[tDir];
        if (Array.isArray(list)) built[engineDir] = list as AttachFrame[];
      }
      attach = built;
    }

    if (typeof value.image !== 'string' || !value.image) {
      throw new ConfigError(`${classId}.json: animation "${name}" missing "image"`);
    }

    clips[name] = {
      frames,
      loop: value.loop === true,
      durationsMs: durationsMs as number[],
      image: value.image,
      rects,
      attach,
    };
  }

  for (const required of ['idle', 'walk'] as const) {
    if (!clips[required]) throw new ConfigError(`${classId}.json: missing required animation "${required}"`);
  }

  const speedRaw = raw.movement_speed_px_per_s;
  const movementSpeedPxPerS = isObj(speedRaw)
    ? { walk: Number(speedRaw.walk) || 0, run: Number(speedRaw.run) || 0 }
    : { walk: 0, run: 0 };

  return {
    frameWidth,
    frameHeight,
    anchor,
    clips,
    signatureClips: Array.isArray(raw.signature_clips) ? (raw.signature_clips as string[]) : [],
    combatClips: Array.isArray(raw.combat_clips) ? (raw.combat_clips as string[]) : [],
    movementSpeedPxPerS,
  };
}

/** data/classes.json entry (one per class) — copied verbatim; only the fields this engine
 * actually needs are typed/validated here (palette/build/weapons are documentation-only today). */
export interface ClassMeta {
  id: string;
  name: string;
  role: string;
  resource: string;
  hp_multiplier: number;
  damage_share: number;
  weapons: string[];
}

export function validateClassMeta(raw: unknown, source = 'classes.json'): ClassMeta[] {
  if (!Array.isArray(raw)) throw new ConfigError(`${source}: expected an array`);
  const ids = new Set<string>();
  return raw.map((c, i) => {
    if (!isObj(c) || typeof c.id !== 'string' || !c.id) throw new ConfigError(`${source}[${i}]: missing id`);
    const where = `${source} → ${c.id}`;
    if (ids.has(c.id)) throw new ConfigError(`${where}: duplicate class id`);
    ids.add(c.id);
    if (typeof c.name !== 'string' || !c.name) throw new ConfigError(`${where}: missing name`);
    if (typeof c.role !== 'string' || !c.role) throw new ConfigError(`${where}: missing role`);
    if (typeof c.resource !== 'string' || !c.resource) throw new ConfigError(`${where}: missing resource`);
    if (typeof c.hp_multiplier !== 'number') throw new ConfigError(`${where}: missing hp_multiplier`);
    if (typeof c.damage_share !== 'number') throw new ConfigError(`${where}: missing damage_share`);
    if (!Array.isArray(c.weapons)) throw new ConfigError(`${where}: missing weapons`);
    return {
      id: c.id,
      name: c.name,
      role: c.role,
      resource: c.resource,
      hp_multiplier: c.hp_multiplier,
      damage_share: c.damage_share,
      weapons: c.weapons as string[],
    };
  });
}

// ---------- deriving the engine-level stats Thistlevane doesn't ship ----------

/**
 * Thistlevane ships 270 pre-computed skill multipliers (not recomputed here) but no
 * concrete base HP/ATK/DEF numbers for a character sheet — those come from formulas in
 * DESIGN.md §5.3 applied at a level. This engine has no server-authoritative level-based
 * stat rescaling (see skills.ts/World.ts), so every class's base stats are derived once at
 * level 1 and held static, exactly like every other character in this engine's roster.
 * Defense has no published formula at all (§5.3 only covers HP/ATK), so it's derived
 * proportionally to hp_multiplier (tanks that out-HP also out-DEF) anchored on this engine's
 * existing baseline character (Ashvale: defense 8 at an effective multiplier of 1).
 */
const BASELINE_LEVEL = 1;
const BASE_DEFENSE_AT_MULTIPLIER_1 = 8;
const GENERIC_RESOURCE_MAX = 100;

export function deriveBaselineCombatStats(meta: ClassMeta): CombatStats {
  return {
    maxHp: Math.round((180 + 22 * BASELINE_LEVEL) * meta.hp_multiplier),
    maxMp: GENERIC_RESOURCE_MAX, // repurposed as the class's own named resource pool (see World.ts)
    attack: 20 + 4 * BASELINE_LEVEL,
    defense: Math.round(BASE_DEFENSE_AT_MULTIPLIER_1 * meta.hp_multiplier),
  };
}

/** Literal projectile weapons — everything else (staff/book/sword/axe/dagger/katana/spear/
 * lute/twin_blades/greatshield/...) is treated as melee reach for this stand-in. */
const RANGED_WEAPON_NAMES = new Set(['bow', 'pistol']);

/**
 * This engine's basic-attack weapon model (range/arc/cooldown geometry) has no Thistlevane
 * equivalent — Thistlevane expects all combat through skills. We derive a stand-in from the
 * class's own level-1 active skill (its real cooldown) and its classes.json weapon name (real
 * data — NOT the skill's own `range` field, which Thistlevane uses as a balance/targeting-tier
 * number rather than a literal geometric reach, so e.g. the Ranger's quick_shot carries the
 * same range as a melee class's basic strike) so hover-to-fight range checks and HUD debug read
 * something real; actual damage for a cast always goes through the skill system, not this.
 */
export function deriveBaselineWeapon(meta: ClassMeta, levelOneActive: Skill | undefined, tickRate: number): WeaponDefinition {
  if (!levelOneActive) return DEFAULT_WEAPON;
  const ranged = meta.weapons.some((w) => RANGED_WEAPON_NAMES.has(w));
  return {
    kind: ranged ? 'ranged' : 'melee',
    rangeTiles: ranged ? Math.max(levelOneActive.range, 5) : levelOneActive.range,
    arcDegrees: 100,
    cooldownTicks: Math.max(1, Math.round(levelOneActive.cooldown * tickRate)),
    ...(ranged ? { projectileSpeedTilesPerSec: 6 } : {}),
  };
}

export function classPortraitPath(classId: string): string {
  return `characters/${classId}/sprites/${classId}_portrait.png`;
}

/** A clip's own strip image (see RichClip.image), inside a class's animations/ folder. */
export function classAnimationImagePath(classId: string, image: string): string {
  return `characters/${classId}/animations/${image}`;
}

export function classAnimationsPath(classId: string): string {
  return `characters/${classId}/animations/${classId}.json`;
}

export function skillIconPath(icon: string): string {
  return `icons/skills/${icon}`;
}

/** All 8 engine Direction values, in case a caller wants to iterate without importing protocol. */
export const ALL_DIRECTIONS: readonly Direction[] = DIRECTIONS;
