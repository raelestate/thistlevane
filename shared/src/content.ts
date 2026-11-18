/**
 * Content catalogues (characters, mobs, effects, zones) loaded from assets/data/*.json.
 * Types + validation only; the data itself is never written in code.
 */
import { ConfigError } from './config';
import { CARDINAL_DIRECTIONS, DIRECTIONS, type Direction } from './protocol';
import { type AggroConfig, type CombatStats, type WeaponDefinition } from './combat';
import {
  deriveBaselineCombatStats,
  deriveBaselineWeapon,
  classPortraitPath,
  parseClassAnimations,
  type ClassMeta,
  type RichClip,
} from './classes';
import type { Skill } from './skills';

export type { CombatStats };

export const CONTENT_FILES = {
  config: 'data/game-config.json',
  zones: 'data/zones.json',
  characters: 'data/characters.json',
  mobs: 'data/mobs.json',
  effects: 'data/effects.json',
  classes: 'data/classes.json',
  skills: 'data/skills.json',
  vfxManifest: 'vfx/manifest.json',
} as const;

export type Gait = 'walk' | 'run';
export const MOVEMENT_ANIM_NAMES = ['idle', 'walk', 'run', 'run_stop'] as const;
/**
 * `attack` covers melee; `attack_ranged` is used instead when the entity's weapon.kind is
 * 'ranged', falling back to `attack` if undefined. `cast`/`interact`/`block` have no gameplay
 * caller yet (no skill/interactable/guard system exists) — they're schema-ready so a future
 * system doesn't need a second animation-schema migration.
 */
export const COMBAT_ANIM_NAMES = ['attack', 'attack_ranged', 'cast', 'hit', 'death', 'resurrect', 'interact', 'block'] as const;
export const ANIMATION_NAMES = [...MOVEMENT_ANIM_NAMES, ...COMBAT_ANIM_NAMES] as const;
export type AnimationName = (typeof ANIMATION_NAMES)[number];
/** Animations that play once and stop, instead of looping. `block` loops/holds like a stance. */
export const NON_LOOPING_ANIM_NAMES = [
  'attack', 'attack_ranged', 'cast', 'hit', 'death', 'resurrect', 'interact', 'run_stop',
] as const;

/** How a spritesheet is laid out and animated. Shared by characters and mobs. */
export interface SpriteDefinition {
  sheet: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  anchor: { x: number; y: number };
  /** Vertical offset (px) of the feet from the bottom edge of the tile. */
  footOffsetY: number;
  rows: Record<Direction, number>;
  /** `run`, `run_stop`, `attack`, `hit`, `death` are optional; `idle` and `walk` are required. */
  animations: Partial<Record<AnimationName, { startColumn: number; frames: number; frameRate: number }>> &
    Record<'idle' | 'walk', { startColumn: number; frames: number; frameRate: number }>;
  /** Effect ids from effects.json played as the entity moves or fights. */
  effects?: { walkStep?: string; runStep?: string; attackHit?: string; death?: string };
}

export interface GridCharacterDefinition extends SpriteDefinition {
  id: string;
  name: string;
  title?: string;
  renderKind?: 'grid';
  combat?: CombatStats;
  /** Optional: classes without one fall back to DEFAULT_WEAPON (see shared/src/combat.ts). */
  weapon?: WeaponDefinition;
}

/**
 * A Thistlevane class rendered faithfully: one strip image per clip, explicit per-frame
 * rects and durations, attach points — built by buildRichCharacter() from data/classes.json
 * + a class's animations/<class>.json, never hand-authored as JSON.
 */
export interface RichCharacterDefinition {
  id: string;
  name: string;
  title?: string;
  renderKind: 'rich';
  classId: string;
  /** This class's resource name (ki, mana, rage, ...) — see World.ts for how the pool is modeled. */
  resource: string;
  frameWidth: number;
  frameHeight: number;
  anchor: { x: number; y: number };
  footOffsetY: number;
  portrait: string;
  clips: Record<string, RichClip>;
  signatureClips: string[];
  /** Reference only — see classes.ts; this engine keeps one global tile movement speed. */
  movementSpeedPxPerS: { walk: number; run: number };
  effects?: { walkStep?: string; runStep?: string; attackHit?: string; death?: string };
  combat: CombatStats;
  weapon: WeaponDefinition;
}

export type CharacterDefinition = GridCharacterDefinition | RichCharacterDefinition;

/** Also accepts a bare SpriteDefinition (mobs never have renderKind at all, so this is always
 * false for them) — lets client rendering code call it on SpriteRef['def']
 * (SpriteDefinition | RichCharacterDefinition) without a cast. */
export function isRichCharacter(def: SpriteDefinition | CharacterDefinition): def is RichCharacterDefinition {
  return (def as { renderKind?: string }).renderKind === 'rich';
}

export interface CharacterCatalog {
  defaultCharacter: string;
  characters: CharacterDefinition[];
}

/** Assembles one class's full CharacterDefinition from its parsed animations.json, its
 * data/classes.json entry, and its level-1 active skill (used only to derive a stand-in
 * basic-attack weapon — see classes.ts). Pure in-memory composition; nothing is written back. */
export function buildRichCharacter(
  meta: ClassMeta,
  anim: { frameWidth: number; frameHeight: number; anchor: { x: number; y: number }; clips: Record<string, RichClip>; signatureClips: string[]; movementSpeedPxPerS: { walk: number; run: number } },
  levelOneActive: Skill | undefined,
  tickRate: number,
): RichCharacterDefinition {
  return {
    id: meta.id,
    name: meta.name,
    title: meta.role,
    renderKind: 'rich',
    classId: meta.id,
    resource: meta.resource,
    frameWidth: anim.frameWidth,
    frameHeight: anim.frameHeight,
    anchor: anim.anchor,
    footOffsetY: 0,
    portrait: classPortraitPath(meta.id),
    clips: anim.clips,
    signatureClips: anim.signatureClips,
    movementSpeedPxPerS: anim.movementSpeedPxPerS,
    effects: { walkStep: 'dust-small', runStep: 'dust-large', attackHit: 'impact' },
    combat: deriveBaselineCombatStats(meta),
    weapon: deriveBaselineWeapon(meta, levelOneActive, tickRate),
  };
}

export interface MobDefinition extends SpriteDefinition {
  id: string;
  name: string;
  /** Ticks per tile while walking (independent of player speed). */
  walkTicksPerTile: number;
  /** Wandering behaviour. */
  wander: { pauseTicksMin: number; pauseTicksMax: number; maxSteps: number };
  /** Marks generated stand-in art so it's never mistaken for final art. */
  placeholder?: boolean;
  combat?: CombatStats;
  /** Level shown in the target frame. */
  level?: number;
  /** Optional: mobs without one fall back to DEFAULT_WEAPON/DEFAULT_AGGRO (see shared/src/combat.ts). */
  weapon?: WeaponDefinition;
  aggro?: AggroConfig;
}

export interface MobCatalog {
  mobs: Record<string, MobDefinition>;
}

export interface EffectDefinition {
  sheet: string;
  frameWidth: number;
  frameHeight: number;
  startFrame: number;
  frames: number;
  frameRate: number;
  anchor: { x: number; y: number };
  /** Draw below or above characters. */
  layer: 'below' | 'above';
}

export interface EffectCatalog {
  effects: Record<string, EffectDefinition>;
}

export interface ZoneRegistry {
  startZone: string;
  zones: Record<string, { name: string; file: string; difficulty?: string; description?: string }>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const posInt = (v: unknown) => Number.isInteger(v) && (v as number) > 0;
const posNum = (v: unknown) => typeof v === 'number' && v > 0;

const REQUIRED_ANIMS = new Set<string>(['idle', 'walk']);

function validateSprite(c: Record<string, unknown>, where: string, needRun: boolean): void {
  if (typeof c.sheet !== 'string') throw new ConfigError(`${where}: missing sheet`);
  for (const k of ['frameWidth', 'frameHeight', 'columns'] as const) {
    if (!posInt(c[k])) throw new ConfigError(`${where}: ${k} must be a positive integer`);
  }
  if (!isObj(c.rows) || DIRECTIONS.some((d) => !Number.isInteger((c.rows as Record<string, unknown>)[d]))) {
    throw new ConfigError(`${where}: rows must map ${DIRECTIONS.join('/')} to row numbers`);
  }
  if (!isObj(c.animations)) throw new ConfigError(`${where}: missing animations`);
  for (const name of ANIMATION_NAMES) {
    const a = (c.animations as Record<string, unknown>)[name];
    if (a === undefined) {
      if (REQUIRED_ANIMS.has(name)) throw new ConfigError(`${where}: animation "${name}" is required`);
      if (name === 'run' && needRun) throw new ConfigError(`${where}: animation "run" is required for characters`);
      continue;
    }
    if (!isObj(a) || !Number.isInteger(a.startColumn) || !posInt(a.frames) || !(Number(a.frameRate) > 0)) {
      throw new ConfigError(`${where}: animation "${name}" needs startColumn, frames, frameRate`);
    }
  }
}

/** Optional: classes/mobs without one fall back to DEFAULT_WEAPON at the use site, not here. */
function validateWeapon(value: unknown, where: string): void {
  if (value === undefined) return;
  if (!isObj(value)) throw new ConfigError(`${where}: weapon must be an object`);
  if (value.kind !== 'melee' && value.kind !== 'ranged') throw new ConfigError(`${where}: weapon.kind must be "melee" or "ranged"`);
  if (!posNum(value.rangeTiles)) throw new ConfigError(`${where}: weapon.rangeTiles must be a positive number`);
  if (!posNum(value.arcDegrees)) throw new ConfigError(`${where}: weapon.arcDegrees must be a positive number`);
  if (!posInt(value.cooldownTicks)) throw new ConfigError(`${where}: weapon.cooldownTicks must be a positive integer`);
  if (value.kind === 'ranged' && !posNum(value.projectileSpeedTilesPerSec)) {
    throw new ConfigError(`${where}: weapon.projectileSpeedTilesPerSec is required for ranged weapons`);
  }
}

/** Optional: mobs without one fall back to DEFAULT_AGGRO at the use site, not here. */
function validateAggro(value: unknown, where: string): void {
  if (value === undefined) return;
  if (!isObj(value)) throw new ConfigError(`${where}: aggro must be an object`);
  if (!posNum(value.detectionRangeTiles)) throw new ConfigError(`${where}: aggro.detectionRangeTiles must be a positive number`);
  if (!posNum(value.leashRangeTiles)) throw new ConfigError(`${where}: aggro.leashRangeTiles must be a positive number`);
  if (!posInt(value.attackWindupTicks)) throw new ConfigError(`${where}: aggro.attackWindupTicks must be a positive integer`);
  if (!posInt(value.respawnTicks)) throw new ConfigError(`${where}: aggro.respawnTicks must be a positive integer`);
  if (value.corpseTicks !== undefined && !posInt(value.corpseTicks)) throw new ConfigError(`${where}: aggro.corpseTicks must be a positive integer`);
}

/** Merges the Thistlevane class roster (data/classes.json + per-class animations.json +
 * data/skills.json) into a base CharacterCatalog (today just Ashvale). Both client and server
 * call this identically after loading the same files, so the two sides can never disagree on
 * a class's combat stats or stand-in weapon. */
export function mergeRichCharacters(
  base: CharacterCatalog,
  classMetas: ClassMeta[],
  rawAnimationsByClass: Record<string, unknown>,
  skills: Skill[],
  tickRate: number,
): CharacterCatalog {
  const richCharacters = classMetas.map((meta) => {
    const parsed = parseClassAnimations(rawAnimationsByClass[meta.id], meta.id);
    const levelOne = skills.find((s) => s.class === meta.id && s.category === 'active' && s.level_required === 1);
    return buildRichCharacter(meta, parsed, levelOne, tickRate);
  });
  return { defaultCharacter: base.defaultCharacter, characters: [...base.characters, ...richCharacters] };
}

export function validateCharacters(raw: unknown, source = 'characters.json'): CharacterCatalog {
  if (!isObj(raw) || !Array.isArray(raw.characters) || raw.characters.length === 0) {
    throw new ConfigError(`${source}: "characters" must be a non-empty array`);
  }
  const ids = new Set<string>();
  for (const c of raw.characters as unknown[]) {
    if (!isObj(c) || typeof c.id !== 'string' || !c.id) throw new ConfigError(`${source}: every character needs an id`);
    const where = `${source} → ${c.id}`;
    if (ids.has(c.id)) throw new ConfigError(`${where}: duplicate id`);
    ids.add(c.id);
    validateSprite(c, where, true);
    validateWeapon(c.weapon, where);
  }
  if (typeof raw.defaultCharacter !== 'string' || !ids.has(raw.defaultCharacter)) {
    throw new ConfigError(`${source}: defaultCharacter must be one of ${[...ids].join(', ')}`);
  }
  return raw as unknown as CharacterCatalog;
}

export function validateMobs(raw: unknown, source = 'mobs.json'): MobCatalog {
  if (!isObj(raw) || !isObj(raw.mobs)) throw new ConfigError(`${source}: "mobs" must be an object`);
  for (const [id, m] of Object.entries(raw.mobs)) {
    const where = `${source} → ${id}`;
    if (!isObj(m) || typeof m.name !== 'string') throw new ConfigError(`${where}: needs name`);
    validateSprite(m, where, false);
    if (!posInt(m.walkTicksPerTile)) throw new ConfigError(`${where}: walkTicksPerTile must be a positive integer`);
    const w = m.wander;
    if (!isObj(w) || !posInt(w.pauseTicksMin) || !posInt(w.pauseTicksMax) || !posInt(w.maxSteps) || (w.pauseTicksMax as number) < (w.pauseTicksMin as number)) {
      throw new ConfigError(`${where}: wander needs pauseTicksMin ≤ pauseTicksMax and maxSteps`);
    }
    validateWeapon(m.weapon, where);
    validateAggro(m.aggro, where);
  }
  return raw as unknown as MobCatalog;
}

export function validateEffects(raw: unknown, source = 'effects.json'): EffectCatalog {
  if (!isObj(raw) || !isObj(raw.effects)) throw new ConfigError(`${source}: "effects" must be an object`);
  for (const [id, e] of Object.entries(raw.effects)) {
    if (!isObj(e) || typeof e.sheet !== 'string' || !posInt(e.frames) || !posInt(e.frameWidth) || !posInt(e.frameHeight)) {
      throw new ConfigError(`${source} → ${id}: needs sheet, frameWidth, frameHeight, frames`);
    }
  }
  return raw as unknown as EffectCatalog;
}

export function validateZones(raw: unknown, source = 'zones.json'): ZoneRegistry {
  if (!isObj(raw) || !isObj(raw.zones)) throw new ConfigError(`${source}: "zones" must be an object`);
  for (const [id, z] of Object.entries(raw.zones)) {
    if (!isObj(z) || typeof z.file !== 'string' || typeof z.name !== 'string') throw new ConfigError(`${source} → ${id}: needs "name" and "file"`);
  }
  if (typeof raw.startZone !== 'string' || !(raw.startZone in raw.zones)) throw new ConfigError(`${source}: startZone must be a listed zone`);
  return raw as unknown as ZoneRegistry;
}
