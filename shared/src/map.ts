/**
 * Reads a Tiled JSON map. Shared so that the server (authority) and the client
 * (prediction + rendering) interpret it identically.
 *
 * Everything comes from the data, never from code. Layers are read bottom to top:
 *  - a tile with `collides: true` blocks the cell,
 *  - a tile with `walkable: true` on a higher layer un-blocks it (a bridge over water),
 *  - any non-zero tile on the configured collision layer always blocks,
 *  - a tile with an integer `level` sets the cell's elevation (default 0),
 *  - a tile with `ramp: true` lets players move between elevations through that cell.
 * Object layers provide player spawns, mob spawn regions and portals.
 */
import type { GameConfig } from './config';
import type { Walkability } from './movement';

export interface TiledProperty {
  name: string;
  type?: string;
  value: unknown;
}

export interface TiledFrame {
  tileid: number;
  duration: number;
}

export interface TiledTileData {
  id: number;
  properties?: TiledProperty[];
  animation?: TiledFrame[];
}

export interface TiledTileset {
  firstgid: number;
  name: string;
  image?: string;
  tilecount: number;
  columns: number;
  tilewidth: number;
  tileheight: number;
  tiles?: TiledTileData[];
  source?: string;
}

export interface TiledTileLayer {
  type: 'tilelayer';
  name: string;
  width: number;
  height: number;
  data: number[];
  visible?: boolean;
  properties?: TiledProperty[];
}

export interface TiledObject {
  type?: string;
  class?: string;
  name?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  properties?: TiledProperty[];
}

export interface TiledObjectLayer {
  type: 'objectgroup';
  name: string;
  objects: TiledObject[];
  properties?: TiledProperty[];
}

export interface TiledMapJson {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  tilesets: TiledTileset[];
  layers: Array<TiledTileLayer | TiledObjectLayer | { type: string; name: string; properties?: TiledProperty[] }>;
  properties?: TiledProperty[];
}

export type MapLayerNames = GameConfig['world']['layers'];

export interface SpawnPoint { name: string; tileX: number; tileY: number }
export interface TileRect { x: number; y: number; w: number; h: number }
export interface Portal extends TileRect { name: string; targetZone: string; targetSpawn: string }
export interface MobSpawn extends TileRect { mob: string; count: number }

/** Tiled stores flip flags in the top bits of a gid. */
const GID_MASK = 0x1fffffff;

export function propertyValue(props: TiledProperty[] | undefined, name: string): unknown {
  return props?.find((p) => p.name === name)?.value;
}

export class MapModel implements Walkability {
  readonly width: number;
  readonly height: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly tileLayers: TiledTileLayer[];
  readonly spawnPoints: SpawnPoint[];
  readonly portals: Portal[];
  readonly mobSpawns: MobSpawn[];
  readonly displayName: string;
  private readonly blocked: Uint8Array;
  private readonly levels: Int8Array;
  private readonly ramps: Uint8Array;
  private readonly tileData = new Map<number, TiledTileData>(); // by global id

  constructor(readonly json: TiledMapJson, readonly layerNames: MapLayerNames) {
    this.width = json.width;
    this.height = json.height;
    this.tileWidth = json.tilewidth;
    this.tileHeight = json.tileheight;
    this.displayName = String(propertyValue(json.properties, 'displayName') ?? '');

    for (const ts of json.tilesets) {
      if (ts.source) throw new Error(`Tileset "${ts.source}" is external; embed tilesets in the map (Tiled: "Embed tileset")`);
      for (const t of ts.tiles ?? []) this.tileData.set(ts.firstgid + t.id, t);
    }

    this.tileLayers = json.layers.filter((l): l is TiledTileLayer => l.type === 'tilelayer');
    for (const layer of this.tileLayers) {
      if (layer.width !== this.width || layer.height !== this.height || layer.data?.length !== this.width * this.height) {
        throw new Error(`Layer "${layer.name}" has the wrong size or is compressed (save layer data as CSV/array)`);
      }
    }

    const n = this.width * this.height;
    this.blocked = new Uint8Array(n);
    this.levels = new Int8Array(n);
    this.ramps = new Uint8Array(n);
    const forced = new Uint8Array(n);
    // Per-gid flags, cached once (maps are large).
    const flags = new Map<number, number>(); // bit1 collides, bit2 walkable, bit4 ramp, level in bits 8+
    const flagsOf = (gid: number): number => {
      let f = flags.get(gid);
      if (f === undefined) {
        const d = this.tileData.get(gid);
        f = 0;
        if (propertyValue(d?.properties, 'collides') === true) f |= 1;
        if (propertyValue(d?.properties, 'walkable') === true) f |= 2;
        if (propertyValue(d?.properties, 'ramp') === true) f |= 4;
        const lvl = propertyValue(d?.properties, 'level');
        if (typeof lvl === 'number') f |= 8 | ((lvl & 0xff) << 8);
        flags.set(gid, f);
      }
      return f;
    };
    for (const layer of this.tileLayers) {
      const isCollisionLayer = layer.name === layerNames.collision;
      const data = layer.data;
      for (let i = 0; i < n; i++) {
        const gid = data[i]! & GID_MASK;
        if (gid === 0) continue;
        if (isCollisionLayer) { forced[i] = 1; continue; }
        const f = flagsOf(gid);
        if (f & 2) this.blocked[i] = 0;
        else if (f & 1) this.blocked[i] = 1;
        if (f & 4) this.ramps[i] = 1;
        if (f & 8) this.levels[i] = (f >> 8) & 0xff;
      }
    }
    for (let i = 0; i < n; i++) if (forced[i]) this.blocked[i] = 1;

    const objectLayer = (name: string) => json.layers.find((l): l is TiledObjectLayer => l.type === 'objectgroup' && l.name === name);
    const typeOf = (o: TiledObject) => o.type ?? o.class;
    const toTile = (px: number, py: number) => ({ tileX: Math.floor(px / this.tileWidth), tileY: Math.floor(py / this.tileHeight) });
    const toRect = (o: TiledObject): TileRect => ({
      x: Math.floor(o.x / this.tileWidth), y: Math.floor(o.y / this.tileHeight),
      w: Math.max(1, Math.round((o.width ?? this.tileWidth) / this.tileWidth)),
      h: Math.max(1, Math.round((o.height ?? this.tileHeight) / this.tileHeight)),
    });

    const spawnLayer = objectLayer(layerNames.spawns);
    this.spawnPoints = (spawnLayer?.objects ?? [])
      .filter((o) => typeOf(o) === layerNames.spawnType)
      .map((o) => ({ name: o.name ?? '', ...toTile(o.x, o.y) }))
      .filter((p) => this.isWalkable(p.tileX, p.tileY));
    this.mobSpawns = (spawnLayer?.objects ?? [])
      .filter((o) => typeOf(o) === layerNames.mobSpawnType)
      .map((o) => ({ ...toRect(o), mob: String(propertyValue(o.properties, 'mob') ?? o.name ?? ''), count: Number(propertyValue(o.properties, 'count') ?? 1) }))
      .filter((m) => m.mob && m.count > 0);
    this.portals = (objectLayer(layerNames.portals)?.objects ?? [])
      .filter((o) => typeOf(o) === layerNames.portalType)
      .map((o) => ({ ...toRect(o), name: o.name ?? '', targetZone: String(propertyValue(o.properties, 'targetZone') ?? ''), targetSpawn: String(propertyValue(o.properties, 'targetSpawn') ?? '') }))
      .filter((p) => p.targetZone);
  }

  /** Can an entity stand on (tileX, tileY)? With an origin, also checks the elevation rule. */
  isWalkable(tileX: number, tileY: number, fromX?: number, fromY?: number): boolean {
    if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) return false;
    if (tileX < 0 || tileY < 0 || tileX >= this.width || tileY >= this.height) return false;
    const i = tileY * this.width + tileX;
    if (this.blocked[i]) return false;
    if (fromX !== undefined && fromY !== undefined && fromX >= 0 && fromY >= 0 && fromX < this.width && fromY < this.height) {
      const j = fromY * this.width + fromX;
      if (this.levels[i] !== this.levels[j] && !this.ramps[i] && !this.ramps[j]) return false;
    }
    return true;
  }

  levelAt(tileX: number, tileY: number): number {
    if (tileX < 0 || tileY < 0 || tileX >= this.width || tileY >= this.height) return 0;
    return this.levels[tileY * this.width + tileX]!;
  }

  isRamp(tileX: number, tileY: number): boolean {
    if (tileX < 0 || tileY < 0 || tileX >= this.width || tileY >= this.height) return false;
    return this.ramps[tileY * this.width + tileX] === 1;
  }

  spawnByName(name: string): SpawnPoint | undefined {
    return this.spawnPoints.find((s) => s.name === name);
  }

  portalAt(tileX: number, tileY: number): Portal | undefined {
    return this.portals.find((p) => tileX >= p.x && tileX < p.x + p.w && tileY >= p.y && tileY < p.y + p.h);
  }

  tileProperty(gid: number, name: string): unknown {
    return propertyValue(this.tileData.get(gid & GID_MASK)?.properties, name);
  }

  tileDataFor(gid: number): TiledTileData | undefined {
    return this.tileData.get(gid & GID_MASK);
  }

  /** Global tile ids at a map cell, one per tile layer (0 = empty). */
  gidsAt(tileX: number, tileY: number): Array<{ layer: TiledTileLayer; gid: number }> {
    if (tileX < 0 || tileY < 0 || tileX >= this.width || tileY >= this.height) return [];
    const i = tileY * this.width + tileX;
    const out: Array<{ layer: TiledTileLayer; gid: number }> = [];
    for (const layer of this.tileLayers) {
      const gid = (layer.data[i] ?? 0) & GID_MASK;
      if (gid !== 0) out.push({ layer, gid });
    }
    return out;
  }

  /** Global id → { tileset, local tile id }. */
  resolveGid(gid: number): { tileset: TiledTileset; localId: number } | null {
    let found: TiledTileset | null = null;
    for (const ts of this.json.tilesets) if (ts.firstgid <= gid && (!found || ts.firstgid > found.firstgid)) found = ts;
    return found ? { tileset: found, localId: gid - found.firstgid } : null;
  }
}
