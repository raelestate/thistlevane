import {
  CONTENT_FILES,
  validateCharacters,
  validateEffects,
  validateGameConfig,
  validateMobs,
  validateZones,
  type CharacterCatalog,
  type CharacterDefinition,
  type EffectCatalog,
  type GameConfig,
  type MobCatalog,
  type SpriteDefinition,
  type ZoneRegistry,
} from '@thistlevane/shared';

/** Everything the client knows about the game's content, loaded from assets/data at startup. */
export interface ClientContent {
  config: GameConfig;
  zones: ZoneRegistry;
  characters: CharacterCatalog;
  mobs: MobCatalog;
  effects: EffectCatalog;
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
  const [config, zones, characters, mobs, effects] = await Promise.all([
    fetchJson(CONTENT_FILES.config),
    fetchJson(CONTENT_FILES.zones),
    fetchJson(CONTENT_FILES.characters),
    fetchJson(CONTENT_FILES.mobs),
    fetchJson(CONTENT_FILES.effects),
  ]);
  return {
    config: validateGameConfig(config),
    zones: validateZones(zones),
    characters: validateCharacters(characters),
    mobs: validateMobs(mobs),
    effects: validateEffects(effects),
  };
}

export function findCharacter(content: ClientContent, id: string): CharacterDefinition {
  return (
    content.characters.characters.find((c) => c.id === id) ??
    content.characters.characters.find((c) => c.id === content.characters.defaultCharacter)!
  );
}

/** Sprite definitions are keyed by a namespace + id so characters and mobs share one renderer. */
export type SpriteRef = { kind: 'character' | 'mob'; id: string; def: SpriteDefinition };

export function findMob(content: ClientContent, id: string): SpriteRef | null {
  const def = content.mobs.mobs[id];
  return def ? { kind: 'mob', id, def } : null;
}

/** Texture / animation key conventions, derived from data ids. */
export const keys = {
  sheet: (ref: Pick<SpriteRef, 'kind' | 'id'>) => `${ref.kind}:${ref.id}`,
  anim: (ref: Pick<SpriteRef, 'kind' | 'id'>, anim: string, dir: string) => `${ref.kind}:${ref.id}:${anim}:${dir}`,
  effectSheet: (sheet: string, w: number, h: number) => `effect-sheet:${sheet}:${w}x${h}`,
  effectAnim: (id: string) => `effect:${id}`,
  map: (id: string) => `map:${id}`,
  tileset: (mapId: string, name: string) => `tileset:${mapId}:${name}`,
};
