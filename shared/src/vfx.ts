/**
 * VFX archetype manifest (assets/vfx/manifest.json), copied verbatim from the
 * Thistlevane delivery. 13 reusable archetypes, each class using 7-9 of them,
 * tinted and pre-rendered per class — this module only types/validates the shape.
 */
import { ConfigError } from './config';

export interface VfxArchetype {
  frames: number;
  loop: boolean;
  durations_ms: number[];
}

export interface VfxClassEntry {
  tint: { base: string; light: string };
  archetypes: string[];
}

export interface VfxManifest {
  frame_size: number;
  archetypes: Record<string, VfxArchetype>;
  classes: Record<string, VfxClassEntry>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export function validateVfxManifest(raw: unknown, source = 'vfx/manifest.json'): VfxManifest {
  if (!isObj(raw) || typeof raw.frame_size !== 'number' || !isObj(raw.archetypes) || !isObj(raw.classes)) {
    throw new ConfigError(`${source}: malformed manifest`);
  }
  for (const [name, a] of Object.entries(raw.archetypes)) {
    if (!isObj(a) || !Number.isInteger(a.frames) || typeof a.loop !== 'boolean' || !Array.isArray(a.durations_ms)) {
      throw new ConfigError(`${source} → archetypes.${name}: needs frames, loop, durations_ms`);
    }
  }
  for (const [cls, entry] of Object.entries(raw.classes)) {
    if (!isObj(entry) || !isObj(entry.tint) || !Array.isArray(entry.archetypes)) {
      throw new ConfigError(`${source} → classes.${cls}: needs tint, archetypes`);
    }
  }
  return raw as unknown as VfxManifest;
}

/** This project copies each class's VFX sheets to assets/vfx/<class>/<archetype>.png
 * (same convention the manifest itself describes), so the path is derived, not read
 * from the manifest's own (differently-rooted) sheet strings. */
export function vfxSheetPath(classId: string, archetype: string): string {
  return `vfx/${classId}/${archetype}.png`;
}

/** Splits a skill's "<class>/<archetype>" vfx reference. */
export function parseVfxRef(vfx: string): { classId: string; archetype: string } {
  const [classId, archetype] = vfx.split('/');
  return { classId: classId ?? '', archetype: archetype ?? '' };
}
