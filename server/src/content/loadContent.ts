import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CONTENT_FILES,
  MapModel,
  validateCharacters,
  validateGameConfig,
  validateMobs,
  validateZones,
  type CharacterCatalog,
  type GameConfig,
  type MobCatalog,
  type TiledMapJson,
  type ZoneRegistry,
} from '@thistlevane/shared';

export interface LoadedZone {
  id: string;
  name: string;
  map: MapModel;
}

export interface ServerContent {
  assetsDir: string;
  config: GameConfig;
  characters: CharacterCatalog;
  mobs: MobCatalog;
  zones: ZoneRegistry;
  startZone: string;
  maps: Map<string, LoadedZone>;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Could not read ${path}: ${(err as Error).message}`);
  }
}

/**
 * Load everything the server needs from the shared assets folder: config, catalogues
 * and every zone's map. `overrides` lets tests tweak config values without editing files.
 */
export function loadServerContent(assetsDir: string, overrides?: (config: GameConfig) => void): ServerContent {
  const dir = resolve(assetsDir);
  const config = validateGameConfig(readJson(join(dir, CONTENT_FILES.config)));
  overrides?.(config);
  const zones = validateZones(readJson(join(dir, CONTENT_FILES.zones)));
  const characters = validateCharacters(readJson(join(dir, CONTENT_FILES.characters)));
  const mobs = validateMobs(readJson(join(dir, CONTENT_FILES.mobs)));

  const startZone = config.world.startZone;
  if (!zones.zones[startZone]) throw new Error(`world.startZone "${startZone}" is not listed in ${CONTENT_FILES.zones}`);

  const maps = new Map<string, LoadedZone>();
  for (const [id, zone] of Object.entries(zones.zones)) {
    const mapPath = join(dir, zone.file);
    const map = new MapModel(readJson(mapPath) as TiledMapJson, config.world.layers);
    if (map.spawnPoints.length === 0) {
      throw new Error(`${mapPath} has no walkable "${config.world.layers.spawnType}" point in layer "${config.world.layers.spawns}"`);
    }
    for (const spawn of map.mobSpawns) {
      if (!mobs.mobs[spawn.mob]) throw new Error(`${mapPath}: mob spawn "${spawn.mob}" is not defined in ${CONTENT_FILES.mobs}`);
    }
    maps.set(id, { id, name: zone.name, map });
  }
  // Portals must point at zones and spawns that exist.
  for (const zone of maps.values()) {
    for (const portal of zone.map.portals) {
      const target = maps.get(portal.targetZone);
      if (!target) throw new Error(`Zone "${zone.id}": portal "${portal.name}" targets unknown zone "${portal.targetZone}"`);
      if (!target.map.spawnByName(portal.targetSpawn)) {
        throw new Error(`Zone "${zone.id}": portal "${portal.name}" targets missing spawn "${portal.targetSpawn}" in "${portal.targetZone}"`);
      }
    }
  }
  return { assetsDir: dir, config, characters, mobs, zones, startZone, maps };
}
