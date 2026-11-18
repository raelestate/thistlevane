/**
 * VFX manifest (assets/vfx/manifest.json), copied verbatim from the Thistlevane
 * delivery. v2: one sheet per skill (keyed by the skill's own id), aimed skills carrying
 * 8 directional rows in the same s/sw/w/nw/n/ne/e/se order as character sprites, self-centred
 * ones carrying 1. This module only types/validates the shape.
 */
import { ConfigError } from './config';
import { THISTLEVANE_DIRECTION_MAP } from './classes';
import type { Direction } from './protocol';

export interface VfxSkillEntry {
  frames: number;
  rows: number;
  directional: boolean;
  loop: boolean;
  durations_ms: number[];
}

export interface VfxManifest {
  frame_size: number;
  /** The caster's foot point, in frame pixels — draw the VFX frame so this sits on the
   * character's own anchor (see classes.ts ParsedClassAnimations.anchor). */
  anchor: { x: number; y: number };
  /** Per-skill VFX, keyed by the skill's own id (e.g. "arcanist_spark_bolt"). */
  skills: Record<string, VfxSkillEntry>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export function validateVfxManifest(raw: unknown, source = 'vfx/manifest.json'): VfxManifest {
  if (!isObj(raw) || typeof raw.frame_size !== 'number' || !isObj(raw.anchor) || !isObj(raw.skills)) {
    throw new ConfigError(`${source}: malformed manifest`);
  }
  const anchor = raw.anchor as Record<string, unknown>;
  if (typeof anchor.x !== 'number' || typeof anchor.y !== 'number') {
    throw new ConfigError(`${source}: anchor must have numeric x/y`);
  }
  for (const [id, e] of Object.entries(raw.skills)) {
    if (
      !isObj(e) ||
      !Number.isInteger(e.frames) ||
      !Number.isInteger(e.rows) ||
      typeof e.directional !== 'boolean' ||
      typeof e.loop !== 'boolean' ||
      !Array.isArray(e.durations_ms)
    ) {
      throw new ConfigError(`${source} → skills.${id}: needs frames, rows, directional, loop, durations_ms`);
    }
  }
  return raw as unknown as VfxManifest;
}

/** This project copies each skill's VFX sheet to assets/vfx/<class>/<archetype>.png (same
 * convention the manifest itself describes), so the path is derived, not read from the
 * manifest's own (differently-rooted) "sheet" string. */
export function vfxSheetPath(classId: string, archetype: string): string {
  return `vfx/${classId}/${archetype}.png`;
}

/** Splits a skill's "<class>/<archetype>" vfx reference. */
export function parseVfxRef(vfx: string): { classId: string; archetype: string } {
  const [classId, archetype] = vfx.split('/');
  return { classId: classId ?? '', archetype: archetype ?? '' };
}

/** Thistlevane's VFX rows follow the same s/sw/w/nw/n/ne/e/se order as character sprites
 * (THISTLEVANE_DIRECTION_MAP in classes.ts) — row index for this engine's own Direction. */
const ENGINE_DIRECTION_ROW = Object.fromEntries(
  Object.keys(THISTLEVANE_DIRECTION_MAP).map((tDir, i) => [THISTLEVANE_DIRECTION_MAP[tDir]!, i]),
) as Record<Direction, number>;

export function vfxDirectionRow(dir: Direction): number {
  return ENGINE_DIRECTION_ROW[dir];
}
