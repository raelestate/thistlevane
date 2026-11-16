/**
 * Content catalogues (characters, mobs, effects, zones) loaded from assets/data/*.json.
 * Types + validation only; the data itself is never written in code.
 */
import { ConfigError } from './config';
import { CARDINAL_DIRECTIONS, DIRECTIONS, type Direction } from './protocol';

export const CONTENT_FILES = {
  config: 'data/game-config.json',
  zones: 'data/zones.json',
  characters: 'data/characters.json',
  mobs: 'data/mobs.json',
  effects: 'data/effects.json',
} as const;

export type Gait = 'walk' | 'run';
export const MOVEMENT_ANIM_NAMES = ['idle', 'walk', 'run'] as const;
export const COMBAT_ANIM_NAMES = ['attack', 'hit', 'death'] as const;
export const ANIMATION_NAMES = [...MOVEMENT_ANIM_NAMES, ...COMBAT_ANIM_NAMES] as const;
export type AnimationName = (typeof ANIMATION_NAMES)[number];

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
  /** `run`, `attack`, `hit`, `death` are optional; `idle` and `walk` are required. */
  animations: Partial<Record<AnimationName, { startColumn: number; frames: number; frameRate: number }>> &
    Record<'idle' | 'walk', { startColumn: number; frames: number; frameRate: number }>;
  /** Effect ids from effects.json played as the entity moves or fights. */
  effects?: { walkStep?: string; runStep?: string; attackHit?: string; death?: string };
}

export interface CombatStats {
  maxHp: number;
  maxMp: number;
  attack: number;
  defense: number;
}

export interface CharacterDefinition extends SpriteDefinition {
  id: string;
  name: string;
  title?: string;
  combat?: CombatStats;
}

export interface CharacterCatalog {
  defaultCharacter: string;
  characters: CharacterDefinition[];
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
  zones: Record<string, { name: string; file: string; difficulty?: string }>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const posInt = (v: unknown) => Number.isInteger(v) && (v as number) > 0;

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
