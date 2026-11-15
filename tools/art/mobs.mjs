#!/usr/bin/env node
// PLACEHOLDER mob sprites: simple lit volumes made with the Codixel core, so the zones
// are populated while real reference art is produced. Writes assets/mobs/<id>.png and
// assets/data/mobs.json (frame layout + behaviour). Replace per mob by editing mobs.json.
//   node tools/art/mobs.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require('./codixel/pixel.cjs');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROWS = ['down', 'left', 'right', 'up'];
const LIGHT = [-0.55, -0.65, 0.52];
const ramp = (hue, o = {}) => P.hueRamp(5, { hue, sat: 0.5, light: [0.16, 0.66], shift: 45, ...o }).map(P.unpack);

const MOBS = {
  slime:            { name: 'Slime', zone: 'barren_grasslands', size: 24, hue: 110, body: 'dome', speed: 8, eyes: true },
  grass_thistle:    { name: 'Grass Thistle', zone: 'barren_grasslands', size: 24, hue: 95, body: 'spiky', speed: 10, eyes: true, accent: ramp(280) },
  chomper_plant:    { name: 'Chomper Plant', zone: 'barren_grasslands', size: 24, hue: 5, body: 'bulb', speed: 12, eyes: false, accent: ramp(100) },
  scorpion:         { name: 'Scorpion', zone: 'wastelands', size: 24, hue: 30, body: 'scorpion', speed: 6, eyes: true },
  desert_crocodile: { name: 'Desert Crocodile', zone: 'wastelands', size: 32, hue: 70, body: 'croc', speed: 7, eyes: true, sat: 0.3 },
  walking_cactus:   { name: 'Walking Cactus', zone: 'wastelands', size: 24, hue: 115, body: 'cactus', speed: 9, eyes: true },
  thorny_flower:    { name: 'Thorny Flower', zone: 'wastelands', size: 24, hue: 330, body: 'flower', speed: 12, eyes: false, accent: ramp(100) },
  wisp:             { name: 'Wisp', zone: 'thistlevane_hollow', size: 24, hue: 180, body: 'orb', speed: 5, eyes: true, glow: true },
  hollow_stag:      { name: 'Hollow Stag', zone: 'thistlevane_hollow', size: 32, hue: 260, body: 'stag', speed: 5, eyes: true, sat: 0.15 },
  myconid:          { name: 'Myconid', zone: 'thistlevane_hollow', size: 24, hue: 20, body: 'mushroom', speed: 9, eyes: true, accent: ramp(200, { sat: 0.2, light: [0.5, 0.9] }) },
  web_spider:       { name: 'Web Spider', zone: 'thistlevane_hollow', size: 24, hue: 270, body: 'spider', speed: 5, eyes: true, sat: 0.2, light: [0.08, 0.4] },
  frost_wolf:       { name: 'Frost Wolf', zone: 'frostvane_peaks', size: 32, hue: 205, body: 'wolf', speed: 4, eyes: true, sat: 0.2, light: [0.3, 0.85] },
  ice_wisp:         { name: 'Ice Wisp', zone: 'frostvane_peaks', size: 24, hue: 200, body: 'orb', speed: 5, eyes: true, glow: true, light: [0.4, 0.95] },
  snow_troll:       { name: 'Snow Troll', zone: 'frostvane_peaks', size: 32, hue: 215, body: 'troll', speed: 8, eyes: true, sat: 0.15, light: [0.3, 0.8] },
  snow_hare:        { name: 'Snow Hare', zone: 'frostvane_peaks', size: 24, hue: 210, body: 'hare', speed: 4, eyes: true, sat: 0.1, light: [0.55, 0.95] },
};

function drawBody(b, m, pal, view, frame, moving) {
  const S = m.size, cx = S / 2, ground = S - 3;
  const bob = moving ? [0, -1, 0, -1][frame] : [0, 0, 1, 1][frame % 4];
  const squash = moving ? [0, 1, 0, 1][frame] : 0;
  const o = { light: LIGHT, k: 0.9, ambient: 0.28 };
  const prims = [];
  switch (m.body) {
    case 'dome': prims.push(P.ell(cx, ground - 5 + bob, 8 + squash, 6 - squash)); break;
    case 'spiky': prims.push(P.ell(cx, ground - 5 + bob, 7, 6)); break;
    case 'bulb': prims.push(P.ell(cx, ground - 8 + bob, 7, 7), P.cap(cx, ground, cx, ground - 6, 2.2)); break;
    case 'scorpion': prims.push(P.ell(cx, ground - 3 + bob, 7, 3.5), P.cap(cx + 5, ground - 4, cx + 8, ground - 12 + bob, 1.6, 1.2), P.ell(cx + 7, ground - 13 + bob, 2, 2), P.cap(cx - 6, ground - 3, cx - 10, ground - 6, 1.8, 1.4)); break;
    case 'croc': prims.push(P.cap(cx - 12, ground - 3 + bob, cx + 9, ground - 3 + bob, 3.5, 4.5), P.ell(cx + 10, ground - 3 + bob, 5, 3)); break;
    case 'cactus': prims.push(P.cap(cx, ground - 1, cx, ground - 16 + bob, 3.5, 3), P.cap(cx - 3, ground - 9, cx - 7, ground - 9, 1.6), P.cap(cx - 7, ground - 9, cx - 7, ground - 14, 1.6), P.cap(cx + 3, ground - 7, cx + 7, ground - 7, 1.6), P.cap(cx + 7, ground - 7, cx + 7, ground - 12, 1.6)); break;
    case 'flower': prims.push(P.cap(cx, ground, cx, ground - 9, 1.6), P.ell(cx, ground - 12 + bob, 7, 6)); break;
    case 'orb': prims.push(P.ell(cx, ground - 9 + bob * 2, 6, 6)); break;
    case 'stag': prims.push(P.cap(cx - 8, ground - 9 + bob, cx + 6, ground - 9 + bob, 4.5), P.ell(cx + 10, ground - 14 + bob, 3.5, 3), P.cap(cx + 7, ground - 11, cx + 9, ground - 15 + bob, 2.2)); break;
    case 'mushroom': prims.push(P.cap(cx, ground, cx, ground - 8 + bob, 3.2, 2.8), P.ell(cx, ground - 11 + bob, 9, 5)); break;
    case 'spider': prims.push(P.ell(cx, ground - 4 + bob, 6, 4.5), P.ell(cx + 6, ground - 4 + bob, 3, 2.5)); break;
    case 'wolf': prims.push(P.cap(cx - 9, ground - 8 + bob, cx + 7, ground - 8 + bob, 4.5, 5), P.ell(cx + 10, ground - 11 + bob, 4.5, 3.5)); break;
    case 'troll': prims.push(P.ell(cx, ground - 11 + bob, 10, 11), P.ell(cx, ground - 20 + bob, 6, 5), P.cap(cx - 10, ground - 12, cx - 12, ground - 3, 3), P.cap(cx + 10, ground - 12, cx + 12, ground - 3, 3)); break;
    case 'hare': prims.push(P.ell(cx, ground - 4 + bob, 6, 4), P.ell(cx + 5, ground - 7 + bob, 3, 2.6), P.cap(cx + 6, ground - 9, cx + 7, ground - 15 + bob, 1.1)); break;
  }
  // shadow
  for (let x = Math.floor(cx - 7); x <= Math.ceil(cx + 7); x++) for (let y = ground; y <= ground + 1; y++)
    if (((x - cx) / 7) ** 2 + ((y - ground - 0.5) / 1.5) ** 2 <= 1 && ((x + y) & 1) === 0) b.px[y * b.w + x] = (100 << 24) | 0x00120a08;
  P.solid(b, prims, pal, o);
  // legs for walkers
  if (['scorpion', 'croc', 'cactus', 'stag', 'spider', 'wolf', 'troll', 'hare', 'mushroom'].includes(m.body)) {
    const n = m.body === 'spider' ? 4 : 2, step = moving ? [1, -1, 1, -1][frame] : 0;
    for (let i = 0; i < n; i++) {
      const lx = cx - 5 + (i * 10) / Math.max(1, n - 1) * (n > 2 ? 1.2 : 1) - (n > 2 ? 2 : 0);
      const dy = (i % 2 ? step : -step);
      b.rect(lx - 1, ground - 2, lx + 1, ground + dy, pal[1]);
    }
  }
  // accents: spikes / petals / teeth
  if (m.body === 'spiky' || m.body === 'flower' || m.body === 'bulb') {
    const acc = m.accent ?? pal;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
      const r = m.body === 'bulb' ? 7 : 8, px = cx + Math.cos(a) * r, py = (m.body === 'flower' ? ground - 12 : ground - 6) + Math.sin(a) * r * 0.8 + bob;
      b.pset(px, py, acc[3]); b.pset(px + Math.cos(a), py + Math.sin(a) * 0.8, acc[4]);
    }
  }
  if (m.body === 'mushroom') for (let i = 0; i < 4; i++) b.pset(cx - 6 + i * 4, ground - 12 + bob, (m.accent ?? pal)[4]);
  // glow halo
  if (m.glow) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - cx, y - (ground - 9 + bob * 2));
    if (d > 6 && d < 9 && ((x + y) & 1) === 0 && !(b.px[y * S + x] >>> 24)) b.px[y * S + x] = (90 << 24) | (P.col(pal[4]) & 0xffffff);
  }
  // eyes
  if (m.eyes && view !== 'up') {
    const ey = ground - (m.body === 'troll' ? 21 : m.body === 'orb' ? 10 : m.body === 'cactus' ? 12 : m.body === 'flower' ? 13 : m.body === 'mushroom' ? 5 : 6) + bob;
    const dark = [20, 16, 30], white = [250, 250, 255];
    const place = view === 'down' ? [cx - 3, cx + 2] : view === 'left' ? [cx - 5] : [cx + 4];
    for (const ex of place) { b.pset(ex, ey, white); b.pset(ex + 1, ey, dark); b.pset(ex, ey + 1, dark); b.pset(ex + 1, ey + 1, dark); }
  }
  // outline
  const src = b.px.slice(), oc = P.col(pal[0]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    if ((src[i] >>> 24) === 255) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < S && y + dy < S && (src[(y + dy) * S + x + dx] >>> 24) === 255)) b.px[i] = oc;
  }
}

mkdirSync(join(ROOT, 'assets', 'mobs'), { recursive: true });
const defs = {};
for (const [id, m] of Object.entries(MOBS)) {
  const pal = ramp(m.hue, { sat: m.sat ?? 0.5, light: m.light ?? [0.16, 0.66] });
  const S = m.size, cols = 6; // 0-1 idle, 2-5 walk
  const sheet = new P.Buf(S * cols, S * ROWS.length);
  ROWS.forEach((view, r) => {
    for (let c = 0; c < cols; c++) {
      const f = new P.Buf(S, S);
      const moving = c >= 2;
      drawBody(f, m, pal, view === 'right' ? 'left' : view, moving ? c - 2 : c, moving);
      const src = view === 'right' ? mirror(f) : f;
      for (let y = 0; y < S; y++) sheet.px.set(src.px.subarray(y * S, (y + 1) * S), (r * S + y) * sheet.w + c * S);
    }
  });
  P.save(sheet, join(ROOT, 'assets', 'mobs', `${id}.png`));
  defs[id] = {
    name: m.name, placeholder: true,
    sheet: `mobs/${id}.png`, frameWidth: S, frameHeight: S, columns: cols,
    anchor: { x: 0.5, y: (S - 2) / S }, footOffsetY: -1,
    rows: Object.fromEntries(ROWS.map((v, i) => [v, i])),
    animations: { idle: { startColumn: 0, frames: 2, frameRate: 2 }, walk: { startColumn: 2, frames: 4, frameRate: 8 } },
    walkTicksPerTile: m.speed,
    wander: { pauseTicksMin: 20, pauseTicksMax: 90, maxSteps: 4 },
  };
}
writeFileSync(join(ROOT, 'assets', 'data', 'mobs.json'), JSON.stringify({ mobs: defs }, null, 2) + '\n');
console.log(`wrote ${Object.keys(defs).length} placeholder mobs`);

function mirror(f) { const m = new P.Buf(f.w, f.h); for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) m.px[y * f.w + (f.w - 1 - x)] = f.px[y * f.w + x]; return m; }
