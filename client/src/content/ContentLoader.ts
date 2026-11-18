import {
  CONTENT_FILES,
  classAnimationsPath,
  mergeRichCharacters,
  validateCharacters,
  validateClassMeta,
  validateEffects,
  validateGameConfig,
  validateMobs,
  validateSkills,
  validateVfxManifest,
  validateZones,
  type CharacterCatalog,
  type CharacterDefinition,
  type EffectCatalog,
  type GameConfig,
  type MobCatalog,
  type RichCharacterDefinition,
  type Skill,
  type SpriteDefinition,
  type VfxManifest,
  type ZoneRegistry,
} from '@thistlevane/shared';

/** Everything the client knows about the game's content, loaded from assets/data at startup. */
export interface ClientContent {
  config: GameConfig;
  zones: ZoneRegistry;
  characters: CharacterCatalog;
  mobs: MobCatalog;
  effects: EffectCatalog;
  skills: Skill[];
  vfxManifest: VfxManifest;
}

/** Base URL of the assets folder (served at the site root by Vite). */
export const ASSET_BASE = new URL(import.meta.env.BASE_URL, location.href);

export function assetUrl(relativePath: string): string {
  return new URL(relativePath, ASSET_BASE).href;
}

async function fetchJson(relativePath: string): Promise<unknown> {
  const url = assetUrl(relativePath);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  return response.json();
}

export async function loadClientContent(): Promise<ClientContent> {
  const [configRaw, zonesRaw, baseCharactersRaw, mobsRaw, effectsRaw, classMetasRaw, skillsRaw, vfxManifestRaw] = await Promise.all([
    fetchJson(CONTENT_FILES.config),
    fetchJson(CONTENT_FILES.zones),
    fetchJson(CONTENT_FILES.characters),
    fetchJson(CONTENT_FILES.mobs),
    fetchJson(CONTENT_FILES.effects),
    fetchJson(CONTENT_FILES.classes),
    fetchJson(CONTENT_FILES.skills),
    fetchJson(CONTENT_FILES.vfxManifest),
  ]);
  const config = validateGameConfig(configRaw);
  const classMetas = validateClassMeta(classMetasRaw);
  const skills = validateSkills(skillsRaw);
  const rawAnimationsByClass = Object.fromEntries(
    await Promise.all(classMetas.map(async (meta) => [meta.id, await fetchJson(classAnimationsPath(meta.id))] as const)),
  );
  const characters = mergeRichCharacters(
    validateCharacters(baseCharactersRaw),
    classMetas,
    rawAnimationsByClass,
    skills,
    config.simulation.tickRate,
  );
  return {
    config,
    zones: validateZones(zonesRaw),
    characters,
    mobs: validateMobs(mobsRaw),
    effects: validateEffects(effectsRaw),
    skills,
    vfxManifest: validateVfxManifest(vfxManifestRaw),
  };
}

export function findCharacter(content: ClientContent, id: string): CharacterDefinition {
  return (
    content.characters.characters.find((c) => c.id === id) ??
    content.characters.characters.find((c) => c.id === content.characters.defaultCharacter)!
  );
}

/** Sprite definitions are keyed by a namespace + id so characters and mobs share one renderer.
 * `def` is a grid SpriteDefinition for every mob and most characters, or a RichCharacterDefinition
 * for a Thistlevane class — EntitySprite branches on `def.renderKind`. */
export type SpriteRef = { kind: 'character' | 'mob'; id: string; def: SpriteDefinition | RichCharacterDefinition };

export function findMob(content: ClientContent, id: string): SpriteRef | null {
  const def = content.mobs.mobs[id];
  return def ? { kind: 'mob', id, def } : null;
}

/** Texture / animation key conventions, derived from data ids. */
export const keys = {
  /** Grid characters/mobs: one shared sheet. */
  sheet: (ref: Pick<SpriteRef, 'kind' | 'id'>) => `${ref.kind}:${ref.id}`,
  /** Rich (Thistlevane) characters: each clip is its own strip/texture. */
  richClipTexture: (ref: Pick<SpriteRef, 'kind' | 'id'>, clipName: string) => `${ref.kind}:${ref.id}:clip:${clipName}`,
  anim: (ref: Pick<SpriteRef, 'kind' | 'id'>, anim: string, dir: string) => `${ref.kind}:${ref.id}:${anim}:${dir}`,
  /** Custom (non-grid) texture frame name within a rich character's clip texture. */
  richFrame: (clip: string, dir: string, frameIndex: number) => `${clip}:${dir}:${frameIndex}`,
  effectSheet: (sheet: string, w: number, h: number) => `effect-sheet:${sheet}:${w}x${h}`,
  effectAnim: (id: string) => `effect:${id}`,
  vfxSheet: (classId: string, archetype: string) => `vfx:${classId}:${archetype}`,
  /** Directional: a skill's VFX plays the row matching the caster's facing (see vfxDirectionRow). */
  vfxAnim: (classId: string, archetype: string, dir: string) => `vfx-anim:${classId}:${archetype}:${dir}`,
  map: (id: string) => `map:${id}`,
  tileset: (mapId: string, name: string) => `tileset:${mapId}:${name}`,
};
