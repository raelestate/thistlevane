import type * as Phaser from 'phaser';
import type { MapModel, TiledFrame, TiledTileLayer } from '@thistlevane/shared';

interface Track {
  /** Phaser tile index (= gid) per frame and cumulative end times. */
  indices: number[];
  ends: number[];
  total: number;
}

interface LoopCell {
  layer: string;
  x: number;
  y: number;
  tile: Phaser.Tilemaps.Tile;
  track: Track;
  offset: number;
}

interface OneShot {
  layer: string;
  x: number;
  y: number;
  track: Track;
  startedAt: number;
  restore: number;
}

/** Looks up the renderer tile currently showing a map cell (null when outside the rendered window). */
export type TileLookup = (layer: string, mapX: number, mapY: number) => Phaser.Tilemaps.Tile | null;

/**
 * Plays Tiled tile animations (Phaser does not do this by itself) and one-shot tile
 * reactions (bush rustle, grass flattening). Works on a windowed renderer: call
 * `rescan` whenever the window moves. Every frame, duration and whether a tile is
 * desynchronised comes from the map's tileset data.
 */
export class TileAnimator {
  private loops: LoopCell[] = [];
  private readonly oneShots = new Map<string, OneShot>();
  private readonly trackCache = new Map<string, Track>();

  constructor(
    private readonly map: MapModel,
    private readonly lookup: TileLookup,
  ) {}

  /** Rebuild the list of looping cells for the given window (tile coords). */
  rescan(x0: number, y0: number, w: number, h: number): void {
    this.loops = [];
    const W = this.map.width;
    for (const layerData of this.map.tileLayers) {
      const data = layerData.data;
      for (let y = Math.max(0, y0); y < Math.min(this.map.height, y0 + h); y++) {
        for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) {
          const gid = data[y * W + x]!;
          if (!gid) continue;
          const anim = this.map.tileDataFor(gid)?.animation;
          if (!anim?.length) continue;
          const tile = this.lookup(layerData.name, x, y);
          if (!tile) continue;
          const track = this.track(String(gid), anim, gid);
          const desync = this.map.tileProperty(gid, 'desync') === true;
          this.loops.push({ layer: layerData.name, x, y, tile, track, offset: desync ? hash(x, y) % track.total : 0 });
        }
      }
    }
  }

  /** Play a one-shot animation (frames are tileset-local ids) on one cell, then restore its normal look. */
  playOnce(layerData: TiledTileLayer, x: number, y: number, frames: TiledFrame[], baseGid: number, now: number): void {
    const key = `${layerData.name}:${x},${y}`;
    const existing = this.oneShots.get(key);
    if (existing && now - existing.startedAt < existing.track.total) return; // already reacting
    const track = this.track(`once:${JSON.stringify(frames)}:${baseGid}`, frames, baseGid);
    this.oneShots.set(key, { layer: layerData.name, x, y, track, startedAt: now, restore: baseGid });
  }

  update(now: number): void {
    for (const cell of this.loops) {
      const key = `${cell.layer}:${cell.x},${cell.y}`;
      if (this.oneShots.has(key)) continue;
      const index = frameAt(cell.track, (now + cell.offset) % cell.track.total);
      if (cell.tile.index !== index) cell.tile.index = index;
    }
    for (const [key, shot] of this.oneShots) {
      const tile = this.lookup(shot.layer, shot.x, shot.y);
      const t = now - shot.startedAt;
      if (t >= shot.track.total) {
        if (tile) tile.index = shot.restore;
        this.oneShots.delete(key);
        continue;
      }
      if (tile) {
        const index = frameAt(shot.track, t);
        if (tile.index !== index) tile.index = index;
      }
    }
  }

  private track(cacheKey: string, frames: TiledFrame[], gidForTileset: number): Track {
    const cached = this.trackCache.get(cacheKey);
    if (cached) return cached;
    const firstGid = this.map.resolveGid(gidForTileset)!.tileset.firstgid;
    const indices: number[] = [];
    const ends: number[] = [];
    let total = 0;
    for (const f of frames) {
      total += Math.max(1, f.duration);
      indices.push(firstGid + f.tileid);
      ends.push(total);
    }
    const track = { indices, ends, total };
    this.trackCache.set(cacheKey, track);
    return track;
  }
}

function frameAt(track: Track, t: number): number {
  for (let i = 0; i < track.ends.length; i++) if (t < track.ends[i]!) return track.indices[i]!;
  return track.indices[track.indices.length - 1]!;
}

/** Stable pseudo-random number per map cell, so desynced tiles look natural but deterministic. */
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return Math.abs(h ^ (h >>> 16));
}
