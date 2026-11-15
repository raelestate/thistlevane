// The four zones. Palettes are hue-shifted ramps (dark→light, 5 steps) built with the Codixel core.
import { ramp } from './tileset.mjs';
import * as Props from './props.mjs';

const r = (hue, o = {}) => ramp(hue, 5, o);

export const ZONES = {
  barren_grasslands: {
    name: 'The Barren Grasslands',
    seed: 11,
    ground: r(72, { sat: 0.42, light: [0.26, 0.6] }),            // dry yellow-green
    groundAlt: r(48, { sat: 0.38, light: [0.3, 0.6] }),          // sun-scorched patches
    altAmount: 0.3,
    path: { kind: 'dirt', pal: r(36, { sat: 0.4, light: [0.3, 0.7] }) },
    water: { pal: r(205, { sat: 0.45, light: [0.25, 0.7] }), ice: false },
    cliff: { rock: r(30, { sat: 0.35, light: [0.16, 0.55] }), lip: r(72, { sat: 0.42, light: [0.26, 0.6] }) },
    rock: r(40, { sat: 0.12, light: [0.2, 0.68] }),
    leaf: r(85, { sat: 0.4, light: [0.18, 0.55] }),
    bark: r(28, { sat: 0.3, light: [0.14, 0.45] }),
    relief: { scale: 0.0065, levels: 3, waterThreshold: 0.33, waterScale: 0.03 },
    trees: [{ make: (b, s) => Props.roundTree(b.leaf, b.bark, s, { clumpR: [4, 7], gaps: 0.15 }), weight: 3 },
            { make: (b, s) => Props.deadTree(b.bark, s), weight: 2 }],
    treeDensity: 0.1, forestScale: 0.02,
    rocks: 0.004, rocks2: 0.0012, bushes: 0.012,
    decors: [['tuft', 0.1], ['flowers', 0.02, [[232, 200, 90], [214, 120, 100], [230, 230, 220]]], ['pebbles', 0.01]],
    mobs: [{ id: 'slime', count: 6 }, { id: 'grass_thistle', count: 4 }, { id: 'chomper_plant', count: 3 }],
    portals: { E: 'wastelands', N: 'thistlevane_hollow' },
  },

  wastelands: {
    name: 'The Wastelands',
    seed: 23,
    ground: r(40, { sat: 0.38, light: [0.36, 0.72] }),           // sand
    groundAlt: r(22, { sat: 0.35, light: [0.3, 0.6] }),          // cracked red earth
    altAmount: 0.42,
    path: { kind: 'dirt', pal: r(28, { sat: 0.36, light: [0.26, 0.6] }) },
    water: { pal: r(190, { sat: 0.4, light: [0.28, 0.7] }), ice: false },
    cliff: { rock: r(14, { sat: 0.42, light: [0.18, 0.58] }), lip: r(40, { sat: 0.38, light: [0.36, 0.72] }) },
    rock: r(18, { sat: 0.25, light: [0.22, 0.66] }),
    leaf: r(95, { sat: 0.35, light: [0.2, 0.55] }),
    bark: r(30, { sat: 0.2, light: [0.16, 0.5] }),
    relief: { scale: 0.0055, levels: 3, waterThreshold: 0.22, waterScale: 0.035 },
    trees: [{ make: (b, s) => Props.deadTree(b.bark, s), weight: 1 }],
    treeDensity: 0.02, forestScale: 0.03,
    rocks: 0.006, rocks2: 0.002, bushes: 0.004,
    cacti: 0.012,
    decors: [['pebbles', 0.03], ['crack', 0.06], ['bones', 0.004]],
    mobs: [{ id: 'scorpion', count: 5 }, { id: 'desert_crocodile', count: 2 }, { id: 'walking_cactus', count: 4 }, { id: 'thorny_flower', count: 4 }],
    portals: { W: 'barren_grasslands', N: 'frostvane_peaks' },
  },

  thistlevane_hollow: {
    name: 'Thistlevane Hollow',
    seed: 37,
    ground: r(120, { sat: 0.3, light: [0.12, 0.4] }),           // dark moss
    groundAlt: r(150, { sat: 0.22, light: [0.12, 0.36] }),      // damp earth
    altAmount: 0.35,
    path: { kind: 'cobble', pal: r(200, { sat: 0.08, light: [0.18, 0.5] }) },
    water: { pal: r(165, { sat: 0.3, light: [0.12, 0.45] }), ice: false },
    cliff: { rock: r(210, { sat: 0.12, light: [0.1, 0.42] }), lip: r(120, { sat: 0.3, light: [0.12, 0.4] }) },
    rock: r(215, { sat: 0.1, light: [0.14, 0.5] }),
    leaf: r(140, { sat: 0.32, light: [0.1, 0.4] }),
    bark: r(260, { sat: 0.12, light: [0.08, 0.3] }),
    relief: { scale: 0.008, levels: 2, waterThreshold: 0.36, waterScale: 0.028 },
    trees: [{ make: (b, s) => Props.twistedTree(b.leaf, b.bark, s), weight: 3 },
            { make: (b, s) => Props.roundTree(b.leaf, b.bark, s, { clumpR: [5, 8], gaps: 0.1 }), weight: 2 }],
    treeDensity: 0.22, forestScale: 0.025,
    rocks: 0.004, rocks2: 0.001, bushes: 0.01,
    ruins: 0.004,
    decors: [['mushrooms', 0.02, [[214, 90, 74], [251, 232, 224]]], ['glowshroom', 0.012, [[120, 220, 230], [190, 250, 250], [255, 255, 255]]], ['tuft', 0.05]],
    mobs: [{ id: 'wisp', count: 5 }, { id: 'hollow_stag', count: 2 }, { id: 'myconid', count: 4 }, { id: 'web_spider', count: 4 }],
    portals: { S: 'barren_grasslands', E: 'frostvane_peaks' },
  },

  frostvane_peaks: {
    name: 'Frostvane Peaks',
    seed: 41,
    ground: r(210, { sat: 0.18, light: [0.6, 0.93], shift: 20 }), // snow
    groundAlt: r(200, { sat: 0.14, light: [0.5, 0.82] }),        // packed snow / shadow
    altAmount: 0.2,
    path: { kind: 'dirt', pal: r(215, { sat: 0.1, light: [0.42, 0.74] }) },
    water: { pal: r(200, { sat: 0.3, light: [0.5, 0.9] }), ice: true },
    cliff: { rock: r(220, { sat: 0.14, light: [0.26, 0.66] }), lip: r(210, { sat: 0.18, light: [0.6, 0.93], shift: 20 }) },
    rock: r(220, { sat: 0.1, light: [0.25, 0.7] }),
    leaf: r(150, { sat: 0.3, light: [0.12, 0.42] }),
    bark: r(25, { sat: 0.22, light: [0.12, 0.4] }),
    snow: r(210, { sat: 0.18, light: [0.6, 0.93], shift: 20 }),
    rimDark: [96, 108, 132],
    relief: { scale: 0.006, levels: 3, waterThreshold: 0.3, waterScale: 0.03 },
    trees: [{ make: (b, s) => Props.pine(b.leaf, b.bark, s, b.snow), weight: 1 }],
    treeDensity: 0.14, forestScale: 0.022,
    rocks: 0.006, rocks2: 0.002, bushes: 0.003,
    decors: [['snowlump', 0.03], ['iceshard', 0.006], ['pebbles', 0.01]],
    mobs: [{ id: 'frost_wolf', count: 3 }, { id: 'ice_wisp', count: 4 }, { id: 'snow_troll', count: 1 }, { id: 'snow_hare', count: 5 }],
    portals: { W: 'thistlevane_hollow', S: 'wastelands' },
  },
};

export const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };
