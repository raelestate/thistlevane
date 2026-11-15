#!/usr/bin/env node
// Generates the zone maps (Tiled JSON) and their tilesets.
//   node tools/world/generate.mjs [--size 500] [--preview] [zone ...]
//
// Terrain model ("3/4 perspective"): each cell has an elevation level 0..L. A cell whose
// southern neighbour is lower shows a cliff FACE in that southern cell (collides). Other
// sides of a plateau get a rim overlay. Moving between levels is only possible through
// RAMP cells, which the generator places where paths cross a level change. The server
// enforces this through tile properties: `level`, `ramp`, `collides`, `walkable`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  P, T, N, E, S, W, NE, SE, SW, NW, DIRS8, Tileset, prop, normMask, groundTile, rimOverlay,
  materialOverlay, waterTile, cliffFaceTile, rampTile, faceShadowTile, composite, lighten,
} from './tileset.mjs';
import * as Props from './props.mjs';
import { ZONES, OPPOSITE } from './biomes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const SIZE = Number(args.includes('--size') ? args[args.indexOf('--size') + 1] : 500);
const PREVIEW = args.includes('--preview');
const wanted = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const zoneIds = wanted.length ? wanted : Object.keys(ZONES);

for (const id of zoneIds) generateZone(id, ZONES[id]);

function generateZone(id, B) {
  const t0 = Date.now();
  const MW = SIZE, MH = SIZE, seed = B.seed;
  const rng = P.rng(seed);
  const inb = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH;
  const idx = (x, y) => y * MW + x;

  // ---------------------------------------------------------------- 1. elevation + water
  const level = new Int8Array(MW * MH);
  const water = new Uint8Array(MW * MH);
  const { scale, levels, waterThreshold, waterScale } = B.relief;
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < MW; x++) {
      const h = P.fbm(x * scale, y * scale, 4, seed) * 0.8 + P.fbm(x * scale * 3, y * scale * 3, 2, seed + 1) * 0.2;
      // fbm lives mostly in 0.3..0.7; cut it into plateaus
      const cuts = levels === 3 ? [0.47, 0.565] : [0.52];
      let L = 0;
      for (const c of cuts) if (h > c) L++;
      level[idx(x, y)] = L;
      if (L === 0 && P.fbm(x * waterScale, y * waterScale, 3, seed + 2) < waterThreshold) water[idx(x, y)] = 1;
    }
  // Map border is level 0 and dry (so edge portals always work)
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const d = Math.min(x, y, MW - 1 - x, MH - 1 - y);
    if (d < 6) { level[idx(x, y)] = 0; water[idx(x, y)] = 0; }
  }
  // Spawn clearing in the middle: flat, dry
  const CX = MW >> 1, CY = MH >> 1;
  const centerLevel = level[idx(CX, CY)];
  for (let y = CY - 16; y <= CY + 16; y++) for (let x = CX - 16; x <= CX + 16; x++) {
    if (Math.hypot(x - CX, y - CY) <= 16) { level[idx(x, y)] = centerLevel; water[idx(x, y)] = 0; }
  }
  // Smooth the level map (5x5 majority) so plateaus have broad, readable shapes
  for (let pass = 0; pass < 2; pass++) {
    const src = level.slice();
    for (let y = 2; y < MH - 2; y++) for (let x = 2; x < MW - 2; x++) {
      const counts = new Int32Array(levels);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) counts[src[idx(x + dx, y + dy)]]++;
      let best = 0; for (let l = 1; l < levels; l++) if (counts[l] > counts[best]) best = l;
      level[idx(x, y)] = best;
    }
  }
  for (let y = CY - 16; y <= CY + 16; y++) for (let x = CX - 16; x <= CX + 16; x++) {
    if (Math.hypot(x - CX, y - CY) <= 16) level[idx(x, y)] = centerLevel;
  }
  // Clamp steps to 1 and kill tiny plateaus / pools
  for (let pass = 0; pass < 6; pass++) {
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const L = level[idx(x, y)];
      for (const [, dx, dy] of DIRS8.slice(0, 4)) {
        if (inb(x + dx, y + dy) && level[idx(x + dx, y + dy)] < L - 1) level[idx(x, y)] = L - 1;
      }
    }
  }
  removeSmallRegions(level, MW, MH, Math.max(40, (MW * MH) / 2500), (a, b) => a === b);
  removeSmallRegions(water, MW, MH, Math.max(25, (MW * MH) / 4000), (a, b) => a === b, 0);
  // faces need a cell below: a plateau of height ≥1 directly above the map bottom row is already excluded by the border

  // ---------------------------------------------------------------- 2. paths + portals
  const portals = [];
  const spawnPoints = [{ name: 'center', x: CX, y: CY }];
  const pathCells = new Set();
  const edgeMid = { N: [CX, 4], S: [CX, MH - 5], W: [4, CY], E: [MW - 5, CY] };
  for (const [side, target] of Object.entries(B.portals)) {
    const [px, py] = edgeMid[side];
    const pts = [[CX, CY]];
    const steps = 6;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      pts.push([Math.round(CX + (px - CX) * t + (rng() - 0.5) * 40), Math.round(CY + (py - CY) * t + (rng() - 0.5) * 40)]);
    }
    pts.push([px, py]);
    for (const c of thickLine(pts, 1.4)) if (inb(c[0], c[1])) pathCells.add(idx(c[0], c[1]));
    const [pw, ph] = side === 'N' || side === 'S' ? [3, 2] : [2, 3];
    const ox = side === 'N' || side === 'S' ? px - 1 : side === 'W' ? 2 : MW - 4;
    const oy = side === 'W' || side === 'E' ? py - 1 : side === 'N' ? 2 : MH - 4;
    for (let y = oy; y < oy + ph; y++) for (let x = ox; x < ox + pw; x++) pathCells.add(idx(x, y));
    portals.push({ side, target, x: ox, y: oy, w: pw, h: ph });
    const inward = { N: [px, 6], S: [px, MH - 7], W: [6, py], E: [MW - 7, py] }[side];
    spawnPoints.push({ name: `from_${target}`, x: inward[0], y: inward[1] });
    // keep the arrival area clear
    for (let y = inward[1] - 2; y <= inward[1] + 2; y++) for (let x = inward[0] - 2; x <= inward[0] + 2; x++) pathCells.add(idx(x, y));
  }
  for (const i of pathCells) water[i] = 0;

  // ---------------------------------------------------------------- 3. classify cells
  const isPath = (x, y) => pathCells.has(idx(x, y));
  const L = (x, y) => (inb(x, y) ? level[idx(x, y)] : 0);
  const isFace = new Uint8Array(MW * MH);    // lower cell directly south of a higher cell
  const isRamp = new Uint8Array(MW * MH);    // 1 = south ramp (replaces a face), 2 = west side ramp, 3 = east side ramp
  for (let y = 1; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (L(x, y - 1) > L(x, y)) {
      if (isPath(x, y)) isRamp[idx(x, y)] = 1;
      else isFace[idx(x, y)] = 1;
    }
  }
  // side ramps: a path cell whose E/W path neighbour is higher
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (!isPath(x, y) || isRamp[idx(x, y)]) continue;
    if (isPath(x - 1, y) && L(x - 1, y) > L(x, y)) isRamp[idx(x, y)] = 2;
    else if (isPath(x + 1, y) && L(x + 1, y) > L(x, y)) isRamp[idx(x, y)] = 3;
    else if (isPath(x, y + 1) && L(x, y + 1) > L(x, y)) isRamp[idx(x, y)] = 1;  // path climbing northward: ramp on lower (north) cell
  }
  // water never on faces/ramps
  for (let i = 0; i < water.length; i++) if (isFace[i] || isRamp[i]) water[i] = 0;

  // ---------------------------------------------------------------- 4. tileset + layers
  const TS = new Tileset(id);
  const ground = new Uint32Array(MW * MH), decor = new Uint32Array(MW * MH), objects = new Uint32Array(MW * MH),
        above = new Uint32Array(MW * MH), elevation = new Uint32Array(MW * MH);
  const occupied = new Uint8Array(MW * MH);

  // level marker tiles (hidden layer): tile property `level`
  const levelTiles = [];
  for (let l = 0; l < levels; l++) {
    const b = new P.Buf(T, T); b.rect(0, 0, T, T, [40 + l * 60, 40, 80]);
    levelTiles.push(TS.add(`level${l}`, b, [prop('level', l)]) + 1);
  }
  const shadowGid = TS.add('faceShadow', faceShadowTile()) + 1;

  const groundCache = new Map();
  const groundKind = (x, y) => {
    // smooth patches of the alternate ground, with an ordered-dither transition at cell level
    const v = P.fbm(x * 0.03, y * 0.03, 3, seed + 5) + (P.fbm(x * 0.11, y * 0.11, 2, seed + 6) - 0.5) * 0.25;
    const edge = 1 - B.altAmount;
    const alt = v + (P.fbm(x * 0.35, y * 0.35, 2, seed + 7) - 0.5) * 0.08 > edge;   // noisy, not dithered, boundary
    // tone variant (light/dark) also as smooth patches
    const tone = P.fbm(x * 0.02 + 100, y * 0.02, 3, seed + 8) + (P.fbm(x * 0.3, y * 0.3, 2, seed + 12) - 0.5) * 0.1;
    const shade = tone > 0.62 ? 1 : tone < 0.4 ? -1 : 0;
    return { alt, shade };
  };
  const altAt = (x, y) => inb(x, y) && groundKind(x, y).alt;
  const groundGid = (x, y) => {
    const { alt } = groundKind(x, y);
    const v = P.hash(x, y, seed + 9) < 0.5 ? 0 : 1 + (P.hash(x, y, seed + 10) * 3 | 0);   // 4 flat variants
    const key = `g:${v}`;
    if (!groundCache.has(key)) groundCache.set(key, TS.add(key, groundTile(B.ground, v, 0, { dab: v === 0 ? 0.02 : 0.08 })) + 1);
    if (!alt) return groundCache.get(key);
    // alternate ground = ragged patch overlaid on the base, auto-tiled by its neighbours
    let m = 0;
    for (const [bit, dx, dy] of DIRS8) if (!inb(x + dx, y + dy) || altAt(x + dx, y + dy)) m |= bit;
    m = normMask(m);
    const akey = `alt:${m}:${x & 1}:${y & 1}:${v}`;
    if (!TS.byKey.has(akey)) TS.add(akey, composite(TS.tiles[groundCache.get(key) - 1], materialOverlay('patch', m, B.groundAlt, x & 1, y & 1, { seed })));
    return TS.byKey.get(akey) + 1;
  };
  const rimGid = (mask, x, y) => {
    const base = groundGid(x, y);
    const key = `rim:${base}:${mask}`;
    if (!TS.byKey.has(key)) {
      const dark = B.rimDark ?? B.cliff.rock[1], light = B.ground[4];
      TS.add(key, composite(TS.tiles[base - 1], rimOverlay(mask, dark, light)));
    }
    return TS.byKey.get(key) + 1;
  };
  const overlayGid = (kind, mask, pal, x, y) => {
    const key = `${kind}:${mask}:${x & 3}:${y & 3}`;
    if (!TS.byKey.has(key)) TS.add(key, materialOverlay(kind, mask, pal, x & 3, y & 3, { seed }));
    return TS.byKey.get(key) + 1;
  };
  const waterGid = (mask, x, y) => {
    const key = `water:${mask}:${x & 1}:${y & 1}`;
    if (!TS.byKey.has(key)) {
      const props = [prop('collides', true), prop('bumpEffect', 'splash')];
      if (B.water.ice) TS.add(key, waterTile(mask, B.water.pal, x & 1, y & 1, 0, true), []);
      else {
        const ids = [0, 1, 2, 3].map((f) => TS.add(`${key}:f${f}`, waterTile(mask, B.water.pal, x & 1, y & 1, f), props));
        TS.byKey.set(key, ids[0]);
        TS.setMeta(ids[0], { animation: ids.map((t) => ({ tileid: t, duration: 300 })) });
      }
    }
    return TS.byKey.get(key) + 1;
  };
  const faceGid = (sideMask, x) => {
    const key = `face:${sideMask}:${x % 5}`;
    if (!TS.byKey.has(key)) TS.add(key, cliffFaceTile(sideMask, B.cliff.rock, B.cliff.lip, x % 5, 0, { seed }), [prop('collides', true)]);
    return TS.byKey.get(key) + 1;
  };
  const rampGid = (kind) => {
    const key = `ramp:${kind}`;
    if (!TS.byKey.has(key)) TS.add(key, rampTile(kind, B.path.pal, B.cliff.rock), [prop('ramp', true)]);
    return TS.byKey.get(key) + 1;
  };

  const sameOrHigher = (x, y, l) => !inb(x, y) || level[idx(x, y)] >= l;
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = idx(x, y), l = level[i];
    elevation[i] = levelTiles[l];
    // ground
    let rim = 0;
    for (const [bit, dx, dy] of DIRS8) if (sameOrHigher(x + dx, y + dy, l)) rim |= bit;
    rim = normMask(rim);
    ground[i] = rim === 0xff ? groundGid(x, y) : rimGid(rim, x, y);
    // water (auto-tiled over ground, replaces it)
    if (water[i]) {
      let m = 0;
      for (const [bit, dx, dy] of DIRS8) if (!inb(x + dx, y + dy) || water[idx(x + dx, y + dy)]) m |= bit;
      ground[i] = waterGid(normMask(m), x, y);
      occupied[i] = 1;
      continue;
    }
    // faces & ramps
    if (isFace[i]) {
      let sm = 0;
      if (isFace[idx(x - 1, y)] || isRamp[idx(x - 1, y)] === 1) sm |= W;
      if (inb(x + 1, y) && (isFace[idx(x + 1, y)] || isRamp[idx(x + 1, y)] === 1)) sm |= E;
      objects[i] = faceGid(sm, x);
      occupied[i] = 1;
      if (inb(x, y + 1) && !water[idx(x, y + 1)] && !isFace[idx(x, y + 1)]) decor[idx(x, y + 1)] = shadowGid;
      continue;
    }
    if (isRamp[i]) {
      objects[i] = rampGid(isRamp[i] === 1 ? 'south' : isRamp[i] === 2 ? 'west' : 'east');
      occupied[i] = 1;
      continue;
    }
    // path overlay
    if (isPath(x, y)) {
      let m = 0;
      for (const [bit, dx, dy] of DIRS8) {
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny) || isPath(nx, ny) || isRamp[idx(nx, ny)]) m |= bit;
      }
      decor[i] = overlayGid(B.path.kind, normMask(m), B.path.pal, x, y);
      occupied[i] = 1; // keep props off paths
    }
  }

  // ---------------------------------------------------------------- 5. props
  const propCache = new Map();
  const placeProp = (x, y, p, cacheKey) => {
    // anchor = bottom-left cell of the footprint
    const top = y - (p.h - 1);
    const cellsNeeded = [];
    for (let dy = 0; dy < p.h; dy++) for (let dx = 0; dx < p.w; dx++) {
      const cx = x + dx, cy = top + dy;
      if (!inb(cx, cy)) return false;
      cellsNeeded.push([cx, cy, dx, dy]);
    }
    const baseL = level[idx(x, y)];
    for (const [cx, cy, dx, dy] of cellsNeeded) {
      const ci = idx(cx, cy);
      const collides = p.collides.some(([a, b]) => a === dx && b === dy);
      const isAbove = p.above.some(([a, b]) => a === dx && b === dy);
      if (collides && (occupied[ci] || water[ci] || level[ci] !== baseL || isFace[ci] || isRamp[ci])) return false;
      if (!isAbove && !collides && (occupied[ci] || water[ci] || isFace[ci] || isRamp[ci])) return false;
      if (isAbove && objects[ci] && !above[ci] && collides) return false;
    }
    if (!propCache.has(cacheKey)) {
      const sl = Props.slice(p);
      const gids = sl.map((row, dy) => row.map((b, dx) => {
        const collides = p.collides.some(([a, c]) => a === dx && c === dy);
        return TS.add(`${cacheKey}:${dx},${dy}`, b, collides ? [prop('collides', true)] : []) + 1;
      }));
      propCache.set(cacheKey, gids);
    }
    const gids = propCache.get(cacheKey);
    for (const [cx, cy, dx, dy] of cellsNeeded) {
      const ci = idx(cx, cy);
      const isAbove = p.above.some(([a, b]) => a === dx && b === dy);
      const collides = p.collides.some(([a, b]) => a === dx && b === dy);
      if (isAbove) { if (!above[ci]) above[ci] = gids[dy][dx]; }
      else if (collides) { objects[ci] = gids[dy][dx]; occupied[ci] = 1; }
      else { if (!decor[ci]) decor[ci] = gids[dy][dx]; occupied[ci] = 1; }
    }
    return true;
  };
  const interior = (x, y) => {
    const l = level[idx(x, y)];
    for (const [, dx, dy] of DIRS8) if (!sameOrHigher(x + dx, y + dy, l)) return false;
    return true;
  };
  const nearSpawn = (x, y) => Math.hypot(x - CX, y - CY) < 14 || spawnPoints.some((s) => Math.hypot(x - s.x, y - s.y) < 5);
  const treeWeights = B.trees.map((t) => t.weight), treeTotal = treeWeights.reduce((a, b) => a + b, 0);
  const pickTree = () => { let v = rng() * treeTotal; for (let i = 0; i < B.trees.length; i++) { v -= treeWeights[i]; if (v <= 0) return i; } return 0; };
  const VARIANTS = 6;

  // trees (forest density field)
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (nearSpawn(x, y) || occupied[idx(x, y)] || !interior(x, y)) continue;
    const forest = P.fbm(x * B.forestScale, y * B.forestScale, 3, seed + 7);
    const dens = Math.max(0, (forest - 0.45) * 2.2) * B.treeDensity + B.treeDensity * 0.08;
    if (rng() < dens) {
      const ti = pickTree(), v = Math.floor(rng() * VARIANTS);
      const key = `tree${ti}v${v}`;
      if (!propCache.has(key + ':p')) propCache.set(key + ':p', B.trees[ti].make(B, seed * 100 + ti * 10 + v));
      placeProp(x, y, propCache.get(key + ':p'), key);
    }
  }
  // rocks, bushes, cacti, ruins
  const scatter = (density, makeFn, keyBase, variants = 4) => {
    for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
      if (nearSpawn(x, y) || occupied[idx(x, y)] || !interior(x, y) || rng() >= density) continue;
      const v = Math.floor(rng() * variants), key = `${keyBase}v${v}`;
      if (!propCache.has(key + ':p')) propCache.set(key + ':p', makeFn(seed * 7 + v));
      placeProp(x, y, propCache.get(key + ':p'), key);
    }
  };
  scatter(B.rocks2, (s) => Props.rock(B.rock, 2, s), 'rock2', 3);
  scatter(B.rocks, (s) => Props.rock(B.rock, 1, s), 'rock1');
  scatter(B.bushes, (s) => Props.bush(B.leaf, s, id === 'barren_grasslands' ? [200, 70, 70] : null), 'bush');
  if (B.cacti) scatter(B.cacti, (s) => Props.cactus(B.leaf, s), 'cactus');
  if (B.ruins) {
    scatter(B.ruins, (s) => Props.pillar(B.rock, s, s % 2 === 0), 'pillar');
    scatter(B.ruins * 2, (s) => Props.ruinWall(B.rock, B.leaf, s), 'ruinwall');
  }
  // small decorations (walkable, decor layer)
  for (const [kind, density, accent] of B.decors) {
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const i = idx(x, y);
      if (occupied[i] || decor[i] || water[i] || isFace[i] || rng() >= density) continue;
      const v = Math.floor(rng() * 4), key = `${kind}v${v}`;
      if (!propCache.has(key + ':p')) {
        const pal = kind === 'bones' ? B.rock : kind === 'snowlump' ? B.snow : kind === 'iceshard' ? B.water.pal : kind === 'crack' ? B.groundAlt : kind === 'mushrooms' || kind === 'glowshroom' ? B.rock : B.leaf;
        propCache.set(key + ':p', kind === 'bones' ? Props.bones(B.rock, seed + v) : Props.decor(kind, pal, seed * 3 + v, accent));
      }
      placeProp(x, y, propCache.get(key + ':p'), key);
    }
  }

  // ---------------------------------------------------------------- 6. mob regions
  const walkableFree = (x, y) => inb(x, y) && !water[idx(x, y)] && !isFace[idx(x, y)] && !objects[idx(x, y)];
  const mobRegions = [];
  for (const mob of B.mobs) {
    let placed = 0, tries = 0;
    const perRegion = 6;
    // Density scales with map area (counts in biomes.mjs are per 100x100 tiles).
    const total = Math.round(mob.count * (MW * MH) / 10000);
    while (placed < total && tries++ < 20000) {
      const w = 14, h = 14;
      let x, y;
      if (rng() < 0.4) {
        // 40% of regions in a ring 22..90 tiles around the spawn so the start area is lively
        const ang = rng() * Math.PI * 2, dist = 22 + rng() * 68;
        x = Math.round(CX + Math.cos(ang) * dist - w / 2); y = Math.round(CY + Math.sin(ang) * dist - h / 2);
      } else {
        x = 8 + Math.floor(rng() * (MW - 16 - w)); y = 8 + Math.floor(rng() * (MH - 16 - h));
      }
      if (x < 8 || y < 8 || x > MW - 16 - w || y > MH - 16 - h) continue;
      if (Math.hypot(x + w / 2 - CX, y + h / 2 - CY) < 20) continue;   // keep the spawn plaza itself quiet
      let free = 0;
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (walkableFree(xx, yy)) free++;
      if (free < w * h * 0.5) continue;
      const count = Math.min(perRegion, total - placed);
      mobRegions.push({ mob: mob.id, count, x, y, w, h });
      placed += count;
    }
  }

  // ---------------------------------------------------------------- 7. write
  const layerId = (() => { let n = 1; return () => n++; })();
  const tileLayer = (name, data, props, visible = true) => ({
    id: layerId(), name, type: 'tilelayer', width: MW, height: MH, x: 0, y: 0, opacity: 1, visible,
    data: Array.from(data), ...(props ? { properties: props } : {}),
  });
  const obj = (() => { let n = 1; return (o) => ({ id: n++, rotation: 0, visible: true, width: 0, height: 0, ...o }); })();
  const tilesetJson = TS.tiledJson(`../tilesets/${id}.png`);
  const map = {
    type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down',
    infinite: false, width: MW, height: MH, tilewidth: T, tileheight: T, nextlayerid: 9, nextobjectid: 9999,
    properties: [prop('displayName', B.name), prop('zone', id)],
    tilesets: [tilesetJson],
    layers: [
      tileLayer('ground', ground),
      tileLayer('decor', decor),
      tileLayer('objects', objects),
      tileLayer('above', above, [prop('aboveCharacters', true)]),
      tileLayer('elevation', elevation, null, false),
      {
        id: layerId(), name: 'spawns', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true,
        objects: [
          ...spawnPoints.map((s) => obj({ name: s.name, type: 'player_spawn', point: true, x: s.x * T + 8, y: s.y * T + 8 })),
          ...mobRegions.map((r) => obj({ name: r.mob, type: 'mob_spawn', x: r.x * T, y: r.y * T, width: r.w * T, height: r.h * T,
            properties: [prop('mob', r.mob), prop('count', r.count)] })),
        ],
      },
      {
        id: layerId(), name: 'portals', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true,
        objects: portals.map((p) => obj({ name: `to_${p.target}`, type: 'portal', x: p.x * T, y: p.y * T, width: p.w * T, height: p.h * T,
          properties: [prop('targetZone', p.target), prop('targetSpawn', `from_${id}`)] })),
      },
    ],
  };
  mkdirSync(join(ROOT, 'assets', 'maps'), { recursive: true });
  mkdirSync(join(ROOT, 'assets', 'tilesets'), { recursive: true });
  writeFileSync(join(ROOT, 'assets', 'maps', `${id}.json`), JSON.stringify(map));
  P.save(TS.image(), join(ROOT, 'assets', 'tilesets', `${id}.png`));
  const sizeMb = (JSON.stringify(map).length / 1e6).toFixed(1);
  console.log(`${id}: ${MW}x${MH}, ${TS.tiles.length} tiles, ${mobRegions.length} mob regions, ${portals.length} portals, ${sizeMb} MB, ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  if (PREVIEW) {
    const out = new P.Buf(MW * T, MH * T), img = TS.image();
    const draw = (data) => {
      for (let i = 0; i < data.length; i++) {
        const g = data[i]; if (!g) continue;
        const t = g - 1, sx = (t % 16) * T, sy = Math.floor(t / 16) * T, X = (i % MW) * T, Y = Math.floor(i / MW) * T;
        for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
          const c = img.px[(sy + y) * img.w + sx + x];
          if (c >>> 24 === 255) out.px[(Y + y) * out.w + X + x] = c;
          else if (c >>> 24) { const u = out.px[(Y + y) * out.w + X + x]; out.px[(Y + y) * out.w + X + x] = P.col(P.mix(P.unpack(u), P.unpack(c), (c >>> 24) / 255)); }
        }
      }
    };
    draw(ground); draw(decor); draw(objects); draw(above);
    const previewDir = process.env.THISTLEVANE_PREVIEW_DIR ?? join(ROOT, 'tools', 'world', 'preview');
    mkdirSync(previewDir, { recursive: true });
    // whole map at 1/8 and a 1:1 crop around the spawn
    const small = P.resize(out, Math.floor(out.w / 8), Math.floor(out.h / 8));
    P.save(small, join(previewDir, `${id}-overview.png`));
    P.save(P.crop(out, (CX - 40) * T, (CY - 28) * T, 80 * T, 56 * T), join(previewDir, `${id}-spawn.png`));
  }
}

// ---------------------------------------------------------------- helpers
function thickLine(points, width) {
  const cells = [];
  const wi = Math.ceil(width);
  for (let s = 0; s < points.length - 1; s++) {
    const [x0, y0] = points[s], [x1, y1] = points[s + 1];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      for (let dy = -wi; dy <= wi; dy++) for (let dx = -wi; dx <= wi; dx++)
        if (dx * dx + dy * dy <= width * width + 0.5) cells.push([Math.round(x + dx), Math.round(y + dy)]);
    }
  }
  return cells;
}

/** Merge regions smaller than `min` cells into a neighbouring value. */
function removeSmallRegions(grid, W, H, min, same, fillValue = null) {
  const seen = new Uint8Array(W * H);
  for (let start = 0; start < grid.length; start++) {
    if (seen[start]) continue;
    const v = grid[start], stack = [start], region = [];
    seen[start] = 1;
    let neighbour = null;
    while (stack.length) {
      const i = stack.pop(); region.push(i);
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (same(grid[j], v)) { if (!seen[j]) { seen[j] = 1; stack.push(j); } }
        else neighbour = grid[j];
      }
      if (region.length > min) break;
    }
    if (region.length <= min && neighbour !== null) {
      const nv = fillValue !== null && v !== fillValue ? fillValue : neighbour;
      for (const i of region) grid[i] = nv;
    }
  }
}
