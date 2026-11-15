import * as Phaser from 'phaser';
import {
  DIRECTION_DELTAS,
  MapModel,
  propertyValue,
  type GameConfig,
  type TiledFrame,
  type TiledMapJson,
} from '@thistlevane/shared';
import { assetUrl, keys, type ClientContent } from '../content/ContentLoader';
import { EffectsManager } from './EffectsManager';
import { TileAnimator } from './TileAnimator';

/** Depth for layers flagged as drawn above characters (tree canopies). */
const ABOVE_DEPTH = 1_000_000;

interface WindowLayer {
  data: number[];
  layer: Phaser.Tilemaps.TilemapLayer;
}

/**
 * Renders one zone. Maps are huge (hundreds of thousands of tiles), so only a
 * window around the camera lives in the Phaser tilemap; it is refilled from the
 * map data when the camera gets near the window's edge. Reacts to players
 * according to tile properties (see docs/content-guide.md).
 */
export class MapView {
  readonly model: MapModel;
  readonly tileSize: { width: number; height: number };
  private readonly tilemap: Phaser.Tilemaps.Tilemap;
  private readonly layers = new Map<string, WindowLayer>();
  private readonly animator: TileAnimator;
  private readonly bumpCooldown = new Map<string, number>();
  private readonly win: { w: number; h: number; margin: number };
  private winX = Number.NaN;
  private winY = Number.NaN;

  private constructor(
    private readonly scene: Phaser.Scene,
    readonly zoneId: string,
    json: TiledMapJson,
    private readonly effects: EffectsManager,
    private readonly config: GameConfig,
  ) {
    this.model = new MapModel(json, config.world.layers);
    this.tileSize = { width: this.model.tileWidth, height: this.model.tileHeight };
    const c = config.client.chunk;
    this.win = { w: Math.min(c.windowWidth, this.model.width), h: Math.min(c.windowHeight, this.model.height), margin: c.refillMarginTiles };

    this.tilemap = scene.make.tilemap({ tileWidth: this.tileSize.width, tileHeight: this.tileSize.height, width: this.win.w, height: this.win.h });
    const tilesets = json.tilesets.map((ts) => {
      const tileset = this.tilemap.addTilesetImage(ts.name, keys.tileset(zoneId, ts.name), ts.tilewidth, ts.tileheight, 0, 0, ts.firstgid);
      if (!tileset) throw new Error(`Tileset "${ts.name}" could not be created`);
      return tileset;
    });

    this.model.tileLayers.forEach((layerData, i) => {
      if (layerData.visible === false || layerData.name === config.world.layers.collision) return;
      const layer = this.tilemap.createBlankLayer(layerData.name, tilesets, 0, 0, this.win.w, this.win.h) as Phaser.Tilemaps.TilemapLayer | null;
      if (!layer) throw new Error(`Map layer "${layerData.name}" could not be created`);
      const above = propertyValue(layerData.properties, config.world.layers.aboveCharactersProperty) === true;
      layer.setDepth(above ? ABOVE_DEPTH + i : -1000 + i);
      this.layers.set(layerData.name, { data: layerData.data, layer });
    });

    this.animator = new TileAnimator(this.model, (name, x, y) => this.tileAt(name, x, y));
    scene.cameras.main.setBounds(0, 0, this.model.width * this.tileSize.width, this.model.height * this.tileSize.height);
  }

  /** Fetch the zone's map JSON and its tileset images, then build the view. */
  static load(scene: Phaser.Scene, content: ClientContent, zoneId: string, effects: EffectsManager): Promise<MapView> {
    const entry = content.zones.zones[zoneId];
    if (!entry) return Promise.reject(new Error(`Server sent unknown zone "${zoneId}" (not in zones.json)`));
    const mapUrl = assetUrl(entry.file);

    return fetch(mapUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load ${mapUrl}: HTTP ${res.status}`);
        return res.json() as Promise<TiledMapJson>;
      })
      .then(
        (json) =>
          new Promise<MapView>((resolve, reject) => {
            let pending = 0;
            for (const ts of json.tilesets) {
              if (!ts.image) return reject(new Error(`Tileset "${ts.name}" has no image (embed tilesets in the map)`));
              const key = keys.tileset(zoneId, ts.name);
              if (scene.textures.exists(key)) continue;
              // Tileset image paths in Tiled are relative to the map file.
              scene.load.image(key, new URL(ts.image, mapUrl).href);
              pending++;
            }
            const build = () => {
              try {
                resolve(new MapView(scene, zoneId, json, effects, content.config));
              } catch (err) {
                reject(err);
              }
            };
            if (pending === 0) return build();
            scene.load.once(Phaser.Loader.Events.COMPLETE, build);
            scene.load.start();
          }),
      );
  }

  /** Keep the rendered window centred near the camera; animate tiles. */
  update(now: number): void {
    const cam = this.scene.cameras.main;
    const cx = Math.floor(cam.midPoint.x / this.tileSize.width);
    const cy = Math.floor(cam.midPoint.y / this.tileSize.height);
    const half = { w: this.win.w >> 1, h: this.win.h >> 1 };
    if (
      Number.isNaN(this.winX) ||
      Math.abs(cx - (this.winX + half.w)) > half.w - this.win.margin ||
      Math.abs(cy - (this.winY + half.h)) > half.h - this.win.margin
    ) {
      this.fillWindow(cx - half.w, cy - half.h);
    }
    this.animator.update(now);
  }

  destroy(): void {
    this.tilemap.destroy();
  }

  /** A player visually entered a tile: step reactions there, rustle reactions on neighbours. */
  onPlayerEnteredTile(x: number, y: number, now: number): void {
    for (const { layer, gid } of this.model.gidsAt(x, y)) {
      const fx = this.model.tileProperty(gid, 'stepEffect');
      if (typeof fx === 'string') this.effects.play(fx, ...this.tileFoot(x, y));
      const anim = parseFrames(this.model.tileProperty(gid, 'stepAnimation'));
      if (anim) this.animator.playOnce(layer, x, y, anim, gid, now);
    }
    for (const { dx, dy } of Object.values(DIRECTION_DELTAS)) this.rustle(x + dx, y + dy, now);
  }

  /** A player walked into a blocking tile. */
  onPlayerBumped(x: number, y: number, now: number): void {
    const key = `${x},${y}`;
    if ((this.bumpCooldown.get(key) ?? 0) > now) return;
    this.bumpCooldown.set(key, now + this.config.client.effects.bumpCooldownMs);
    for (const { gid } of this.model.gidsAt(x, y)) {
      const fx = this.model.tileProperty(gid, 'bumpEffect');
      if (typeof fx === 'string') this.effects.play(fx, ...this.tileFoot(x, y));
    }
    this.rustle(x, y, now);
  }

  /** World position of the bottom-centre of a tile. */
  tileFoot(x: number, y: number): [number, number] {
    return [(x + 0.5) * this.tileSize.width, (y + 1) * this.tileSize.height];
  }

  private rustle(x: number, y: number, now: number): void {
    for (const { layer, gid } of this.model.gidsAt(x, y)) {
      const anim = parseFrames(this.model.tileProperty(gid, 'rustleAnimation'));
      if (anim) this.animator.playOnce(layer, x, y, anim, gid, now);
    }
  }

  private tileAt(layerName: string, mapX: number, mapY: number): Phaser.Tilemaps.Tile | null {
    const wl = this.layers.get(layerName);
    if (!wl) return null;
    const lx = mapX - this.winX, ly = mapY - this.winY;
    if (lx < 0 || ly < 0 || lx >= this.win.w || ly >= this.win.h) return null;
    return wl.layer.getTileAt(lx, ly, true);
  }

  private fillWindow(x0: number, y0: number): void {
    x0 = Math.max(0, Math.min(this.model.width - this.win.w, x0));
    y0 = Math.max(0, Math.min(this.model.height - this.win.h, y0));
    if (x0 === this.winX && y0 === this.winY) return;
    this.winX = x0;
    this.winY = y0;
    const W = this.model.width;
    for (const { data, layer } of this.layers.values()) {
      layer.setPosition(x0 * this.tileSize.width, y0 * this.tileSize.height);
      for (let y = 0; y < this.win.h; y++) {
        const row = (y0 + y) * W + x0;
        for (let x = 0; x < this.win.w; x++) {
          const gid = data[row + x]!;
          const tile = layer.getTileAt(x, y, true)!;
          if (gid) {
            tile.index = gid;
            tile.visible = true;
          } else {
            tile.index = -1;
            tile.visible = false;
          }
        }
      }
    }
    this.animator.rescan(x0, y0, this.win.w, this.win.h);
  }
}

const frameCache = new Map<string, TiledFrame[] | null>();

/** Tile reaction animations are stored in Tiled as JSON strings: [{"tileid":1,"duration":80}, …]. */
function parseFrames(value: unknown): TiledFrame[] | null {
  if (typeof value !== 'string') return null;
  if (frameCache.has(value)) return frameCache.get(value)!;
  let frames: TiledFrame[] | null = null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed) && parsed.every((f) => Number.isInteger(f?.tileid) && typeof f?.duration === 'number')) {
      frames = parsed as TiledFrame[];
    }
  } catch {
    /* handled below */
  }
  if (!frames) console.warn('[map] invalid tile animation property:', value);
  frameCache.set(value, frames);
  return frames;
}
