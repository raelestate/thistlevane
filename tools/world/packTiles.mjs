// Loader/accessor over the real Thistlevane v2.2 tileset atlases (assets/tilesets/<biome>.png +
// assets/tilesets/tilesets.json), so generate.mjs can render ground/water/scatter/prop art from
// real pack pixels instead of synthesizing it procedurally. Cliffs, ramps, the plateau rim and the
// path overlay stay procedural (tileset.mjs) — this module only backs the pieces the pack actually
// covers: ground, terrain-blend transitions, liquid/shore, small detail scatter, and block props.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { P, T } from './tileset.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'assets', 'tilesets', 'tilesets.json'), 'utf8'));

const cache = new Map();
function biomeData(biome) {
  if (cache.has(biome)) return cache.get(biome);
  const meta = manifest.biomes[biome];
  if (!meta) throw new Error(`packTiles: no "${biome}" entry in assets/tilesets/tilesets.json`);
  const img = P.load(join(ROOT, meta.image));
  const byRole = {};
  meta.tiles.forEach((t, id) => { (byRole[t.role] ??= []).push({ id, ...t }); });
  const data = { meta, img, columns: meta.columns, byRole };
  cache.set(biome, data);
  return data;
}

function cropTile(biome, id) {
  const { img, columns } = biomeData(biome);
  return P.crop(img, (id % columns) * T, Math.floor(id / columns) * T, T, T);
}

/** One of the terrain's seamless ground variants (role `ground`). */
export function groundTile(biome, terrain, variant) {
  const { byRole } = biomeData(biome);
  const matches = byRole.ground.filter((t) => t.terrain === terrain);
  if (!matches.length) throw new Error(`packTiles: ${biome} has no ground tiles for terrain "${terrain}"`);
  return cropTile(biome, matches[((variant % matches.length) + matches.length) % matches.length].id);
}

/** A blob-transition tile where `top` spreads over `bottom` at the given neighbour code (role
 * `transition`). No match for the code (incl. 255, "surrounded") falls back to plain `top` ground. */
export function transitionTile(biome, top, bottom, code) {
  const { byRole } = biomeData(biome);
  const matches = byRole.transition.filter((t) => t.top === top && t.bottom === bottom);
  const hit = matches.find((t) => t.code === code);
  return hit ? cropTile(biome, hit.id) : groundTile(biome, top, code);
}

/** One of the liquid terrain's variants (role `liquid`). */
export function liquidTile(biome, terrain, variant) {
  const { byRole } = biomeData(biome);
  const matches = byRole.liquid.filter((t) => t.terrain === terrain);
  if (!matches.length) throw new Error(`packTiles: ${biome} has no liquid tiles for terrain "${terrain}"`);
  return cropTile(biome, matches[((variant % matches.length) + matches.length) % matches.length].id);
}

/** A land-over-liquid shore tile (role `shore`), for a water cell with `code` = how many of its 8
 * neighbours are also water (same bit order as `neighbourCode`). Fully-surrounded water (255) or an
 * unmapped code falls back to a plain liquid tile — this is called for water cells, never land ones. */
export function shoreTile(biome, land, liquid, code) {
  if (code === 255) return liquidTile(biome, liquid, 0);
  const { byRole } = biomeData(biome);
  const matches = byRole.shore.filter((t) => t.top === land && t.bottom === liquid);
  const hit = matches.find((t) => t.code === code);
  return hit ? cropTile(biome, hit.id) : liquidTile(biome, liquid, 0);
}

/** One of the biome's transparent scatter tiles (role `detail`, e.g. "tuft"/"pebbles"). Returns null
 * if the biome has no detail tile with that label. */
export function detailTile(biome, label, variant = 0) {
  const { byRole } = biomeData(biome);
  const matches = byRole.detail.filter((t) => t.label === label);
  if (!matches.length) return null;
  return cropTile(biome, matches[variant % matches.length].id);
}

export function detailLabels(biome) {
  return biomeData(biome).byRole.detail.map((t) => t.label);
}

// Bit order N,NE,E,SE,S,SW,W,NW per docs/thistlevane-pack/TILESETS.md's own `code_for`; diagonals
// only count when both adjoining edges are also set (what reduces 256 cases to the shipped 47).
// This is a distinct convention from tileset.mjs's `normMask` (N,E,S,W,NE,SE,SW,NW bit *values*),
// used only for the procedural elevation rim — the two are never mixed.
const PACK_BITS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
export function neighbourCode(x, y, isSame) {
  let c = 0;
  for (let i = 0; i < 8; i++) {
    const [dx, dy] = PACK_BITS[i];
    if (isSame(x + dx, y + dy)) c |= 1 << i;
  }
  for (const [bit, a, b] of [[1, 0, 2], [3, 2, 4], [5, 4, 6], [7, 6, 0]]) {
    if (!(((c >> a) & 1) && ((c >> b) & 1))) c &= ~(1 << bit);
  }
  return c;
}

/** All prop block-descriptors whose `name` is `prefix` or `prefix_<n>` (a size/look variant). The
 * manifest's own `name` isn't unique across size variants of the same prop, so this always returns
 * an array — callers pick one (e.g. by seeded rng), never look it up by name alone. */
export function propsByPrefix(biome, prefix) {
  return biomeData(biome).meta.props.filter((p) => p.name === prefix || p.name.startsWith(`${prefix}_`));
}

/** Build a prop object shaped like props.mjs's own ({ w, h, buf, collides, above }) from one block
 * descriptor (`{ name, first_tile, w, h, anchor_tile }`, as returned by `propsByPrefix`). `collides`
 * defaults to every cell in the anchor row, `above` to every cell in rows above it — the same
 * convention props.mjs's hand-built trees use (canopy drawn above the player, trunk/base collides).
 * Pass `{ walkable: true }` for small non-blocking scatter (what the old engine's `bones`/`snowlump`/
 * `iceshard` decor was: prop-shaped art placed with no collision at all). */
export function propObject(biome, entry, o = {}) {
  const { w, h, anchor_tile: anchor, first_tile } = entry;
  const ay = anchor[1];
  const { columns } = biomeData(biome);
  const buf = new P.Buf(w * T, h * T);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const crop = cropTile(biome, first_tile + row * columns + col);
      for (let y = 0; y < T; y++) buf.px.set(crop.px.subarray(y * T, (y + 1) * T), (row * T + y) * buf.w + col * T);
    }
  }
  const collides = [], above = [];
  if (!o.walkable) {
    for (let row = 0; row < h; row++) for (let col = 0; col < w; col++) {
      if (row === ay) collides.push([col, row]);
      else if (row < ay) above.push([col, row]);
    }
  }
  return { w, h, buf, collides, above };
}
