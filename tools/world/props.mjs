// Props drawn with the Codixel core: lit volumes (P.solid), foliage, conifers, rocks.
// Every prop returns { w, h (in tiles), buf, collides (array of [dx,dy] tile cells), above (cells drawn over players) }.
import { P, T, lighten } from './tileset.mjs';

const buf = (w, h) => new P.Buf(w * T, h * T);
const LIGHT = [-0.55, -0.65, 0.52];

/** 1x1 or 2x2 boulder, lit volume with a contact shadow. */
export function rock(pal, size = 1, seed = 1) {
  const b = buf(size, size), r = P.rng(seed), S = size * T;
  const rx = S * (0.34 + r() * 0.08), ry = S * (0.26 + r() * 0.06), cx = S / 2, cy = S * 0.6;
  b.rect(cx - rx, cy + ry * 0.7, cx + rx, cy + ry + 1, lighten(pal[0], -0.02));   // ground shadow
  const prims = [P.ell(cx, cy, rx, ry), P.ell(cx - rx * 0.4, cy - ry * 0.3, rx * 0.5, ry * 0.55)];
  if (size > 1) prims.push(P.ell(cx + rx * 0.45, cy + ry * 0.1, rx * 0.45, ry * 0.5));
  P.solid(b, prims, pal, { light: LIGHT, k: 1.2, ambient: 0.25 });
  outline(b, pal[0]);
  return { w: size, h: size, buf: b, collides: cells(size, size), above: [] };
}

/** Round-crowned tree (2x3 tiles). Canopy cells are drawn above players, trunk row collides. */
export function roundTree(leafPal, barkPal, seed = 1, o = {}) {
  const b = buf(2, 3);
  P.branchTree(b, {
    x: T, base: 3 * T - 3, trunk: o.trunk ?? 14, width: o.width ?? 2.6, depth: o.depth ?? 2,
    spread: o.spread ?? 0.6, decay: 0.7, up: 0.2, clumpR: o.clumpR ?? [5, 8], tipClumps: 3,
    cols: leafPal, bark: barkPal, seed, light: LIGHT, cell: 2.0, edge: 0.65, gaps: o.gaps ?? 0,
  });
  shadowEllipse(b, T, 3 * T - 2, 9, 3);
  outline(b, lighten(leafPal[0], -0.08));
  return { w: 2, h: 3, buf: b, collides: [[0, 2], [1, 2]], above: [[0, 0], [1, 0], [0, 1], [1, 1]] };
}

/** Dead / bare tree for barren places (2x3). */
export function deadTree(barkPal, seed = 1) {
  const b = buf(2, 3);
  P.branchTree(b, {
    x: T, base: 3 * T - 3, trunk: 16, width: 2.4, depth: 3, spread: 0.7, decay: 0.68, up: 0.1,
    clumpR: [0.1, 0.2], tipClumps: 0, midLeaves: -1, cols: barkPal, bark: barkPal, seed, light: LIGHT,
  });
  shadowEllipse(b, T, 3 * T - 2, 7, 2.5);
  outline(b, barkPal[0]);
  return { w: 2, h: 3, buf: b, collides: [[0, 2], [1, 2]], above: [[0, 0], [1, 0], [0, 1], [1, 1]] };
}

/** Pine (2x3). */
export function pine(leafPal, barkPal, seed = 1, snowPal = null) {
  const b = buf(2, 3);
  P.conifer(b, { x: T, base: 3 * T - 3, h: 44, rx: 15, cols: leafPal, bark: barkPal, seed, light: LIGHT, bare: 7, width: 2.2 });
  if (snowPal) {
    // snow on the upper faces of the foliage: lighten pixels whose upper neighbour is empty
    const src = b.px.slice();
    for (let y = 1; y < b.h; y++)
      for (let x = 0; x < b.w; x++) {
        const i = y * b.w + x;
        if (src[i] >>> 24 && !(src[i - b.w] >>> 24) && P.hash(x, y, seed) < 0.75) b.px[i] = P.col(snowPal[3]);
        else if (src[i] >>> 24 && src[i - b.w] >>> 24 && !(src[i - 2 * b.w] >>> 24) && P.hash(x, y, seed + 1) < 0.4) b.px[i] = P.col(snowPal[2]);
      }
  }
  shadowEllipse(b, T, 3 * T - 2, 8, 2.5);
  outline(b, lighten(leafPal[0], -0.08));
  return { w: 2, h: 3, buf: b, collides: [[0, 2], [1, 2]], above: [[0, 0], [1, 0], [0, 1], [1, 1]] };
}

/** Twisted dark-forest tree (3x4): thick trunk, wide crown. */
export function twistedTree(leafPal, barkPal, seed = 1) {
  const b = buf(3, 4);
  P.branchTree(b, {
    x: 1.5 * T, base: 4 * T - 3, trunk: 20, width: 4, depth: 3, spread: 0.85, decay: 0.72, up: 0.05, jitter: 0.7,
    clumpR: [5, 9], tipClumps: 3, cols: leafPal, bark: barkPal, seed, light: LIGHT, cell: 2.2, edge: 0.6, gaps: 0.08,
  });
  shadowEllipse(b, 1.5 * T, 4 * T - 2, 12, 3);
  outline(b, lighten(leafPal[0], -0.08));
  return { w: 3, h: 4, buf: b, collides: [[1, 3]], above: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]] };
}

/** Bush (1x1) from foliage clumps. */
export function bush(leafPal, seed = 1, berry = null) {
  const b = buf(1, 1), r = P.rng(seed);
  const cl = [];
  for (let i = 0; i < 6; i++) cl.push({ x: 8 + (r() - 0.5) * 8, y: 9 + (r() - 0.5) * 5, r: 3.5 + r() * 2, z: r() * 3 });
  shadowEllipse(b, 8, 14.5, 6.5, 1.8);
  P.foliage(b, cl, { cols: leafPal, light: LIGHT, cell: 1.8, edge: 0.6, seed });
  if (berry) for (let i = 0; i < 3; i++) b.pset(4 + r() * 8, 6 + r() * 5, berry);
  outline(b, lighten(leafPal[0], -0.08));
  return { w: 1, h: 1, buf: b, collides: [[0, 0]], above: [] };
}

/** Cactus (1x2) with arms. */
export function cactus(pal, seed = 1) {
  const b = buf(1, 2), r = P.rng(seed);
  const arms = [P.cap(8, 28, 8, 6, 3.2, 2.6)];
  if (r() < 0.8) arms.push(P.cap(5, 18, 2.5, 18, 1.8), P.cap(2.5, 18, 2.5, 11, 1.8, 1.6));
  if (r() < 0.8) arms.push(P.cap(11, 15, 13.5, 15, 1.8), P.cap(13.5, 15, 13.5, 8, 1.8, 1.6));
  shadowEllipse(b, 8, 30, 5, 1.5);
  P.solid(b, arms, pal, { light: LIGHT, k: 0.9, ambient: 0.25 });
  for (let y = 4; y < 30; y += 3) { b.pset(6, y, pal[4]); b.pset(10, y + 1, pal[4]); }  // spines
  outline(b, pal[0]);
  return { w: 1, h: 2, buf: b, collides: [[0, 1]], above: [[0, 0]] };
}

/** Standing stone / ruin pillar (1x2). */
export function pillar(pal, seed = 1, broken = false) {
  const b = buf(1, 2);
  const top = broken ? 10 + (seed % 5) : 3;
  P.solid(b, [P.cap(8, 29, 8, top, 4.2, 3.6)], pal, { light: LIGHT, k: 0.8, ambient: 0.3 });
  for (let y = top + 3; y < 29; y += 5) for (let x = 5; x < 12; x++) if (P.hash(x, y, seed) < 0.5) b.pset(x, y, pal[1]);
  shadowEllipse(b, 8, 30.5, 5, 1.5);
  outline(b, pal[0]);
  return { w: 1, h: 2, buf: b, collides: [[0, 1]], above: [[0, 0]] };
}

/** Ruined wall segment (1x1), mossy. */
export function ruinWall(pal, mossPal, seed = 1) {
  const b = buf(1, 1);
  const h = 9 + (seed % 4);
  P.surface(b, {
    height: P.rockHeight({ sx: 6, sy: 3, seed, crack: 0.15, tilt: 0.6, warp: 1 }),
    cols: pal, moss: mossPal, mossUp: 0.05, mossCut: 0.45, relief: 2, ambient: 0.3, light: LIGHT,
    mask: (x, y) => y >= T - h && y < T - 1 && x >= 0,
  });
  for (let x = 0; x < T; x++) { b.pset(x, T - h - 1, pal[3]); b.pset(x, T - 1, pal[0]); }
  outline(b, pal[0]);
  return { w: 1, h: 1, buf: b, collides: [[0, 0]], above: [] };
}

/** Bones (1x1 decoration, walkable). */
export function bones(pal, seed = 1) {
  const b = buf(1, 1), r = P.rng(seed);
  const c = pal[4], d = pal[2];
  b.rect(3, 9, 12, 10, c); b.rect(2, 8, 3, 11, d); b.rect(12, 8, 13, 11, d);
  if (r() < 0.6) { for (let i = 0; i < 4; i++) b.rect(5 + i * 2, 4, 6 + i * 2, 6, c); b.rect(4, 6, 12, 7, d); }
  b.pset(3, 10, d); b.pset(11, 10, d);
  return { w: 1, h: 1, buf: b, collides: [], above: [] };
}

/** Small ground decoration (walkable): flowers, grass tufts, pebbles, mushrooms, snow lumps, ice shards. */
export function decor(kind, pal, seed = 1, accent = null) {
  const b = buf(1, 1), r = P.rng(seed);
  if (kind === 'tuft') {
    for (let i = 0; i < 3; i++) {
      const bx = 3 + r() * 10, by = 7 + r() * 7, h = 3 + r() * 3, lean = (r() - 0.5) * 2;
      for (let k = 0; k < h; k++) b.pset(bx + lean * k / h, by - k, pal[k >= h - 2 ? 4 : 2]);
    }
  } else if (kind === 'flowers') {
    for (let i = 0; i < 3; i++) {
      const fx = 3 + r() * 10, fy = 5 + r() * 8;
      b.pset(fx, fy + 1, pal[1]); b.pset(fx, fy + 2, pal[1]);
      const c = accent[Math.floor(r() * accent.length)];
      b.pset(fx - 1, fy, c); b.pset(fx + 1, fy, c); b.pset(fx, fy - 1, c); b.pset(fx, fy, lighten(c, 0.25));
    }
  } else if (kind === 'pebbles') {
    for (let i = 0; i < 4; i++) { const x = 2 + r() * 11, y = 4 + r() * 9; b.pset(x, y, pal[3]); b.pset(x + 1, y, pal[2]); b.pset(x, y + 1, pal[1]); }
  } else if (kind === 'mushrooms') {
    for (let i = 0; i < 3; i++) {
      const mx = 3 + r() * 9, my = 6 + r() * 7;
      b.pset(mx, my + 1, pal[4]); b.pset(mx, my + 2, pal[3]);
      for (let dx = -1; dx <= 1; dx++) b.pset(mx + dx, my, accent[0]);
      b.pset(mx, my - 1, accent[0]); b.pset(mx, my, accent[1]);
    }
  } else if (kind === 'snowlump') {
    const cx = 5 + r() * 6, cy = 8 + r() * 4, rx = 3 + r() * 3;
    P.solid(b, [P.ell(cx, cy, rx, rx * 0.6)], pal, { light: LIGHT, k: 1.5, ambient: 0.5 });
  } else if (kind === 'iceshard') {
    for (let i = 0; i < 2; i++) {
      const x = 4 + r() * 8, h = 5 + r() * 6, y0 = 14;
      for (let k = 0; k < h; k++) { b.pset(x + (k % 2 ? 0 : 1), y0 - k, pal[2 + (k > h - 3 ? 2 : 0)]); b.pset(x - 1 + (k % 2), y0 - k, pal[1]); }
    }
  } else if (kind === 'crack') {
    let x = 2 + r() * 4, y = 2 + r() * 4;
    for (let k = 0; k < 10; k++) { b.pset(x, y, pal[0]); x += r() < 0.7 ? 1 : 0; y += r() < 0.6 ? 1 : 0; if (r() < 0.3) b.pset(x + 1, y - 1, pal[1]); }
  } else if (kind === 'glowshroom') {
    for (let i = 0; i < 2; i++) {
      const mx = 4 + r() * 8, my = 7 + r() * 5;
      b.pset(mx, my + 1, pal[3]); b.pset(mx, my + 2, pal[2]);
      for (let dx = -2; dx <= 2; dx++) b.pset(mx + dx, my, accent[0]);
      for (let dx = -1; dx <= 1; dx++) b.pset(mx + dx, my - 1, accent[1]);
      b.pset(mx, my - 1, accent[2]);
    }
  }
  return { w: 1, h: 1, buf: b, collides: [], above: [] };
}

// ---------------------------------------------------------------- helpers
function cells(w, h) { const out = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push([x, y]); return out; }

function shadowEllipse(b, cx, cy, rx, ry) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1 && x >= 0 && y >= 0 && x < b.w && y < b.h) {
        if (((x + y) & 1) === 0) b.px[y * b.w + x] = (110 << 24) | 0x00120a08;
      }
}

/** 1px outline in `color` around all opaque pixels (shadows excluded by their low alpha). */
function outline(b, color) {
  const c = P.col(color), src = b.px.slice(), W = b.w, H = b.h;
  const solid = (i) => (src[i] >>> 24) === 255;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (solid(i)) continue;
      if ((x > 0 && solid(i - 1)) || (x < W - 1 && solid(i + 1)) || (y > 0 && solid(i - W)) || (y < H - 1 && solid(i + W))) b.px[i] = c;
    }
}

/** Cut a prop buffer into 16x16 tiles: returns [[buf per cell]] indexed [dy][dx]. */
export function slice(propObj) {
  const out = [];
  for (let dy = 0; dy < propObj.h; dy++) {
    const row = [];
    for (let dx = 0; dx < propObj.w; dx++) {
      const t = new P.Buf(T, T);
      for (let y = 0; y < T; y++) t.px.set(propObj.buf.px.subarray((dy * T + y) * propObj.buf.w + dx * T, (dy * T + y) * propObj.buf.w + dx * T + T), y * T);
      row.push(t);
    }
    out.push(row);
  }
  return out;
}
