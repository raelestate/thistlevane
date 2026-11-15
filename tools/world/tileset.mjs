// Dynamic tileset builder + auto-tiling material renderers (16px tiles).
// Rendering uses the Codixel core (tools/art/codixel/pixel.js): hue-shifted ramps,
// banded shading, lit surfaces. Tiles are created on demand per neighbour mask, so
// a tileset only contains the shapes a map actually uses.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const P = require('../art/codixel/pixel.cjs');

export const T = 16;
export const COLS = 16;

// Neighbour bits: N=1 E=2 S=4 W=8 NE=16 SE=32 SW=64 NW=128
export const N = 1, E = 2, S = 4, W = 8, NE = 16, SE = 32, SW = 64, NW = 128;
export const DIRS8 = [[N, 0, -1], [E, 1, 0], [S, 0, 1], [W, -1, 0], [NE, 1, -1], [SE, 1, 1], [SW, -1, 1], [NW, -1, -1]];

export const prop = (name, value) => ({
  name,
  type: typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? 'int' : 'string',
  value,
});

export class Tileset {
  constructor(name) {
    this.name = name;
    this.tiles = [];
    this.meta = new Map();
    this.byKey = new Map();
  }
  /** Add a 16x16 P.Buf. Returns local id. `key` dedupes. */
  add(key, buf, props, animation) {
    if (this.byKey.has(key)) return this.byKey.get(key);
    const id = this.tiles.length;
    this.tiles.push(buf);
    this.byKey.set(key, id);
    const m = {};
    if (props?.length) m.properties = props;
    if (animation) m.animation = animation;
    if (Object.keys(m).length) this.meta.set(id, m);
    return id;
  }
  setMeta(id, patch) {
    this.meta.set(id, { ...(this.meta.get(id) ?? {}), ...patch });
  }
  image() {
    const rows = Math.max(1, Math.ceil(this.tiles.length / COLS));
    const out = new P.Buf(COLS * T, rows * T);
    this.tiles.forEach((t, i) => {
      const x0 = (i % COLS) * T, y0 = Math.floor(i / COLS) * T;
      for (let y = 0; y < T; y++) out.px.set(t.px.subarray(y * T, (y + 1) * T), (y0 + y) * out.w + x0);
    });
    return out;
  }
  tiledJson(imagePath) {
    const img = this.image();
    return {
      firstgid: 1, name: this.name, image: imagePath, imagewidth: img.w, imageheight: img.h,
      tilewidth: T, tileheight: T, tilecount: this.tiles.length, columns: COLS, margin: 0, spacing: 0,
      tiles: [...this.meta.entries()].sort((a, b) => a[0] - b[0]).map(([id, m]) => ({ id, ...m })),
    };
  }
}

// ---------------------------------------------------------------- colour helpers
export const ramp = (hue, n = 5, opt = {}) => P.hueRamp(n, { hue, sat: 0.5, light: [0.18, 0.66], shift: 45, ...opt }).map(P.unpack);
export const lighten = (c, d) => { const [h, s, l] = P.toHsl(c); return P.hsl(h, s, P.clamp(l + d)); };

export const tile = () => new P.Buf(T, T);
export const copyTile = (src) => { const b = tile(); b.px.set(src.px); return b; };

/** Draw `over` on top of `under` (alpha 0 = transparent). */
export const composite = (under, over) => {
  const b = copyTile(under);
  for (let i = 0; i < b.px.length; i++) if (over.px[i] >>> 24) b.px[i] = over.px[i];
  return b;
};

// ---------------------------------------------------------------- shapes
/** Is pixel inside a material whose rounded blob shape is given by the 8-neighbour mask? */
export function insideShape(mask, x, y, rOut = 5.5) {
  const px = x + 0.5, py = y + 0.5;
  for (const [a, b, cx, cy] of [[N, W, 0, 0], [N, E, T, 0], [S, E, T, T], [S, W, 0, T]]) {
    if (!(mask & a) && !(mask & b)) {
      const ox = cx + (cx === 0 ? rOut : -rOut), oy = cy + (cy === 0 ? rOut : -rOut);
      const inQ = (cx === 0 ? px < ox : px > ox) && (cy === 0 ? py < oy : py > oy);
      if (inQ && Math.hypot(px - ox, py - oy) > rOut) return false;
    }
  }
  return true;
}

/** Approx. distance in px from a pixel to the nearest edge of the material (inside the tile). */
export function edgeDistance(mask, x, y, rOut = 5.5) {
  const px = x + 0.5, py = y + 0.5;
  let d = 99;
  if (!(mask & N)) d = Math.min(d, py);
  if (!(mask & S)) d = Math.min(d, T - py);
  if (!(mask & W)) d = Math.min(d, px);
  if (!(mask & E)) d = Math.min(d, T - px);
  for (const [a, b, cx, cy] of [[N, W, 0, 0], [N, E, T, 0], [S, E, T, T], [S, W, 0, T]]) {
    if (!(mask & a) && !(mask & b)) {
      const ox = cx + (cx === 0 ? rOut : -rOut), oy = cy + (cy === 0 ? rOut : -rOut);
      const inQ = (cx === 0 ? px < ox : px > ox) && (cy === 0 ? py < oy : py > oy);
      if (inQ) d = Math.min(d, rOut - Math.hypot(px - ox, py - oy));
    } else if ((mask & a) && (mask & b)) {
      // diagonal missing: a tiny notch of the other material at this corner
      const dg = a === N && b === W ? NW : a === N && b === E ? NE : a === S && b === E ? SE : SW;
      if (!(mask & dg)) d = Math.min(d, Math.hypot(px - cx, py - cy) - 1.0);
    }
  }
  return d;
}

/** Normalise a mask: diagonals only count when both adjacent edges are present. */
export function normMask(m) {
  if (!((m & N) && (m & W))) m &= ~NW;
  if (!((m & N) && (m & E))) m &= ~NE;
  if (!((m & S) && (m & E))) m &= ~SE;
  if (!((m & S) && (m & W))) m &= ~SW;
  return m;
}

// ---------------------------------------------------------------- ground
/**
 * Ground tile: flat top-down surface with low-frequency tone variation and a few dabs.
 * `pal` = 5-step ramp, `detail(buf, x, y, rnd)` optional per-tile decoration.
 * `wx, wy` = world tile coords so variation is continuous across tiles.
 */
export function groundTile(pal, variant, shade, o = {}) {
  const b = tile();
  const dab = o.dab ?? 0.08;
  const base = 2 + shade;                   // palette index of the flat colour (1..3)
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const h = P.hash(x + variant * 31, y + variant * 17, 5);
      let i = base;
      if (h < dab) i = base - 1;
      else if (h < dab * 1.5) i = Math.min(pal.length - 1, base + 1);
      b.pset(x, y, pal[Math.max(0, Math.min(pal.length - 1, i))]);
    }
  // a couple of 2px blades/pebbles so the surface is not pure noise
  const r = P.rng(variant * 7 + shade + 3);
  for (let k = 0; k < 2 + variant; k++) {
    const x = Math.floor(r() * 14), y = 2 + Math.floor(r() * 12);
    b.pset(x, y, pal[Math.max(0, base - 1)]); b.pset(x + 1, y, pal[Math.max(0, base - 1)]);
    b.pset(x + 1, y - 1, pal[Math.min(pal.length - 1, base + 1)]);
  }
  return b;
}

/** Plateau rim: dark edge line + highlight lip on the sides of the tile that face lower ground. */
export function rimOverlay(mask, dark, light) {
  const b = tile();
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const d = edgeDistance(mask, x, y, 4.5);
      const brink = !(mask & S) && y > T - 4;                 // south edge: the drop, lit lip
      if (brink) { if (d < 1.0) b.pset(x, y, light); else if (d < 2.0) b.pset(x, y, lighten(light, -0.05)); continue; }
      if (d < 2.0) b.pset(x, y, dark);
      else if (d < 3.0) b.pset(x, y, lighten(dark, 0.12));
    }
  return b;
}

/** Auto-tiled overlay material (path, sand, cobble...) drawn over ground. */
export function materialOverlay(kind, mask, pal, wx, wy, o = {}) {
  const b = tile();
  const edgeDark = o.edgeDark ?? pal[0], edgeLight = o.edgeLight ?? pal[pal.length - 1];
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      if (!insideShape(mask, x, y)) continue;
      const gx = wx * T + x, gy = wy * T + y;
      const d = edgeDistance(mask, x, y);
      let c;
      if (kind === 'cobble') {
        const row = Math.floor(gy / 4), off = row % 2 ? 2 : 0;
        const mortar = gy % 4 === 3 || (gx + off) % 4 === 3;
        const stone = ((Math.floor((gx + off) / 4) * 7 + row * 13) % 5);
        c = mortar ? pal[0] : pal[1 + (stone % 3)];
        if (!mortar && gy % 4 === 0) c = pal[Math.min(pal.length - 1, 2 + (stone % 3))];
      } else if (kind === 'planks') {
        const plank = Math.floor(gy / 4) % 2;
        c = gy % 4 === 3 ? pal[0] : pal[plank ? 2 : 3];
        if (gy % 4 === 0 && (gx + gy) % 5 === 0) c = pal[4];
      } else if (kind === 'patch') {
        // ragged-edged ground patch: no edge line, the boundary dissolves into the base ground
        if (d < 2.5 && P.hash(gx, gy, 77) < (2.5 - d) / 2.5) continue;
        const h = P.hash(gx, gy, 21 + (o.seed ?? 0));
        c = pal[2];
        if (h < 0.05) c = pal[1];
        else if (h < 0.09) c = pal[3];
        b.pset(x, y, c);
        continue;
      } else {
        const h = P.hash(gx, gy, 21 + (o.seed ?? 0));
        c = pal[2];
        if (h < 0.06) c = pal[1];
        else if (h < 0.1) c = pal[3];
        if (P.hash(gx >> 1, gy >> 1, 29) < 0.04) c = pal[1];       // small 2x2 stones
      }
      if (d < 1.0) c = (!(mask & S) && y > 8) ? edgeDark : edgeDark;
      else if (d < 1.8 && !(mask & N) && y < 4) c = pal[3];       // light lip on the north edge
      b.pset(x, y, c);
    }
  return b;
}

/** Water tile with shoreline band + foam, 4 animation frames. `ice` = frozen look (no animation). */
export function waterTile(mask, pal, wx, wy, frame = 0, ice = false) {
  const b = tile();
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      if (!insideShape(mask, x, y)) continue;
      const gx = wx * T + x, gy = wy * T + y;
      const d = edgeDistance(mask, x, y);
      let c;
      if (ice) {
        const v = 0.55 + (P.fbm(gx * 0.06, gy * 0.06, 3, 31) - 0.5) * 0.6;
        c = pal[P.band(P.clamp(v), pal.length, gx, gy, 0.2)];
        const crack = P.voronoi(gx / 9, gy / 9, 5).edge;
        if (crack < 0.06) c = pal[1];
        if (d < 1.2) c = pal[0];
        else if (d < 2.4) c = pal[Math.min(pal.length - 1, 4)];
      } else {
        const v = 0.42 + (P.loopNoise(gx * 0.045, gy * 0.09, frame, 4, 0.35, 2, 15) - 0.5) * 0.5;
        c = pal[P.band(P.clamp(v), 4, gx, gy, 0.3) + 0];                       // only the 4 darker steps for the body
        const glint = P.loopNoise(gx * 0.12, gy * 0.3, frame, 4, 0.6, 1, 16);
        if (glint > 0.78 && (gy % 3) === 0) c = pal[4];                            // moving highlights
        if (d < 2.0) c = lighten(pal[0], -0.04);
        if (d >= 2.0 && d < 3.0) c = (gx + gy + frame) % 4 ? pal[4] : pal[3];      // foam
      }
      b.pset(x, y, c);
    }
  return b;
}

/**
 * Cliff face: the vertical drop seen in the cell south of a plateau edge.
 * `sideMask` bits: W/E set when the neighbouring cell is also a face (continues).
 * Lit rock strata from a height field; a lip of the upper ground along the top.
 */
export function cliffFaceTile(sideMask, rockPal, lipPal, wx, wy, o = {}) {
  const b = tile();
  const height = P.rockHeight({ sx: 10, sy: 5, seed: 3 + (o.seed ?? 0), crack: 0.12, tilt: 1.0, warp: 3 });
  const strata = (gx, gy) => height(gx, gy) + Math.sin(gy * 0.9 + P.fbm(gx * 0.08, gy * 0.08, 2, 44) * 3) * 0.25;
  P.surface(b, {
    height: (x, y) => strata(wx * T + x, wy * T + y),
    cols: rockPal, relief: 2.2, ambient: 0.3, light: [-0.5, -0.8, 0.45],
    gain: 1.0, dither: 0.2,
    shade: (x, y) => 1 - (y / T) * 0.35,   // darker toward the bottom (occlusion)
  });
  const lipH = o.lipHeight ?? 3;
  for (let x = 0; x < T; x++) {
    for (let y = 0; y < lipH; y++) b.pset(x, y, lipPal[y === lipH - 1 ? 1 : 3]);
    if (P.hash(wx * T + x, wy, 8) < 0.35) b.pset(x, lipH, lipPal[2]);          // overhanging tufts / drips
    b.pset(x, T - 1, lighten(rockPal[0], -0.05));                                 // ground shadow line
  }
  if (!(sideMask & W)) for (let y = lipH; y < T; y++) b.pset(0, y, rockPal[0]);
  if (!(sideMask & E)) for (let y = lipH; y < T; y++) b.pset(T - 1, y, rockPal[0]);
  return b;
}

/** Ramp: a dirt slope replacing a cliff face (vertical ramp) or a side slope. */
export function rampTile(kind, dirtPal, rockPal) {
  const b = tile();
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      let v = 0.5 + (P.fbm(x * 0.2, y * 0.2, 2, 61) - 0.5) * 0.5;
      if (kind === 'south') v -= y / T * 0.25;                 // darker as it goes down
      else v -= (kind === 'west' ? x : T - 1 - x) / T * 0.2;
      let c = dirtPal[P.band(P.clamp(v), dirtPal.length, x, y, 0.25)];
      if (kind === 'south' && y % 4 === 3 && x > 1 && x < T - 2) c = dirtPal[0];   // step lines
      if (kind === 'south' && (x < 1 || x > T - 2)) c = rockPal[0];
      b.pset(x, y, c);
    }
  return b;
}

/** Soft drop shadow under a cliff face (alpha gradient), drawn on the decor layer. */
export function faceShadowTile() {
  const b = tile();
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < T; x++) {
      const a = Math.round(90 * (1 - y / 6));
      if (((x + y) & 1) === 0 || y < 2) b.px[y * T + x] = (a << 24) | 0x00140a08;
    }
  return b;
}
