// Thistlevane Meadow — Prototype Tiles (Milestone 3, iteration 2)
// Art Bible palette: warm meadow greens, earthy paths, cool water

// ── Palette ──────────────────────────────────────────────────────────────────
pal({
  K: "#2a1f2d",   // Deep Bark (primary outline)
  P: "#3d2845",   // Shadow Plum

  // Grass ramp
  g: "#a8d86a",   // Grass Highlight
  G: "#6aaa38",   // Grass Base
  d: "#3d7a28",   // Grass Shadow
  D: "#2a5c1e",   // Grass Deep

  // Earth ramp
  e: "#d4b07a",   // Earth Light
  E: "#a87d4a",   // Earth Base
  b: "#785028",   // Earth Shadow

  // Water ramp
  w: "#88ccee",   // Water Highlight
  W: "#4a8ab8",   // Water Base
  u: "#2a5a88",   // Water Shadow
  U: "#1a3858",   // Water Deep

  // Stone ramp
  s: "#b8b0a0",   // Stone Light
  S: "#888070",   // Stone Base
  z: "#585048",   // Stone Shadow

  // Wood ramp
  o: "#c8a060",   // Wood Light
  O: "#8a6838",   // Wood Base
  k: "#5a3e22",   // Wood Shadow

  // Foliage ramp
  l: "#78c848",   // Leaf Highlight
  L: "#4a9830",   // Leaf Base
  f: "#2a6828",   // Leaf Shadow

  // Flowers
  y: "#e8a848",   // Flower Warm (dandelion)
  p: "#a868c8",   // Flower Cool (thistle)
  r: "#e85868",   // Flower Bright (poppy)
  R: "#ffe0b8",   // Highlight white
})

ramps("PDdGg", "PbEe", "UuWw", "PzSs", "PkOo", "PfLl")

// ── GRASS TILES (16×16) ─────────────────────────────────────────────────────

// Base grass — varied meadow texture with tufts and shadow patches
sprite("grass_base", `
  GGgGGdGGGgGGGGdG
  GGGGGGGGGGGdGGGG
  dGGGgGGGGGGGGGgG
  GGGGGGGdGGGGGGGG
  GGdGGGGGGGgGGGdG
  GGGGGgGGGGGGGGGG
  GGGGGGGGdGGGgGGG
  GdGGGGGGGGGGGGGd
  GGGGgGGGGGGdGGGG
  GGGGGGGdGGGGGGGG
  gGGGGGGGGGGGGGgG
  GGGdGGGGGgGGGGGG
  GGGGGGGGGGGGdGGG
  GGgGGGdGGGGGGGGG
  GGGGGGGGGgGGGGdG
  dGGGGGGGGGGGgGGG`)

// Grass with tall tuft detail — darker bases, light tips
sprite("grass_tuft", `
  GGGGGGGGGGgGGGGG
  GGgGGGGGGGGGGGdG
  GGGGGGdGGGGGGGGG
  GGGdGGGGGGGGdGGG
  GGgdGGGGGGGgdGGG
  GGdGGGGgGGGdGGGG
  GDGGGGGGGGDGGGdG
  GGGGgGGGGGGGGGGG
  GGGGGGGGdGGGGGGG
  GdGGGGGGGGGGGGgG
  GGGGGgGGGGGGGGGG
  GGGGGGGGGdGGgGGG
  GGdGGGGGGGGGGGGd
  GGgdGGGGGGGgdGGG
  GGdGGGdGGGGdGGGG
  GDGGGGGGGGDGGGgG`)

// Grass with wildflowers — 2-3px flower clusters, visible at game scale
sprite("grass_flowers", `
  GGGGGGGGGGgGGGGG
  GGgGGGGGGGGGGGdG
  GGGGGyGGGGGGGGGG
  GGGGyyyGGGGGGGGG
  GGGGGyGdGGGGGGdG
  GGdGGdGGGGGGrGGG
  GGGGGGGGGGGrrGGG
  GGgGGGGGGGGGrGGd
  GGGGGGGGGGGGdGGG
  GGGGGGdGGGGGGGgG
  GGGpGGGGGGGGGGGG
  GGpppGGGGGGGGGGG
  GGGpGGGGGGGGGdGG
  GGGdGGGGGgGGGGGG
  dGGGGGGGdGGGGGGG
  GGGGgGGGGGGdGGGG`)

// ── DIRT / PATH TILES (16×16) ────────────────────────────────────────────────

// Earth path — more texture with small pebble details
sprite("dirt_base", `
  EEeEEEbEEeEEEEeE
  EEEEEEEEEEeEEEEE
  eEEbEEEEEEEEbEEe
  EEEEEeEEEeEEEeEE
  EEEEEEbEeEEEEEEE
  EEeEEEEEEEEEeEEE
  EbEEEEeEEEbEEEEE
  EEEEEEEEEEEeEEbE
  EeEEbEEEEEEEEEeE
  EEEEeEEbEEEEEEEE
  EEEEEEEEEeEEbEEE
  eEEEEEbEEEEEeEEE
  EEEbEeEEEEEEEEEe
  EEEEEEEEEEeEEEbE
  EEeEEEEeEEEbEEEE
  EEEEbEEEEEEEeEEE`)

// Dirt-to-grass transition (grass on top, dirt below)
sprite("dirt_grass_top", `
  GGdGGGGdGGGGGgGG
  dGGGGgGGGGGdGGGG
  GGdGGGGGdGGGGGGd
  bEEDGGGGGDEEbEEd
  EEEEbEbEEEEEEEEE
  EEeEEEEEeEeEEEEE
  EEEEEEeEEEEEEeEE
  EEbEeEEEEEEbEEEE
  EeEEEEEEeEEEEEEE
  EEEEEEeEEEEEEEEe
  EEbEEEEEEEEeEEEE
  EEeEEEbEeEEEEEEE
  EEEEEeEEEEEEbEeE
  EEEEEEEEEEeEEEEE
  eEEEEbEEeEEEEEEE
  EEEEeEEEEEEeEEEE`)

// ── WATER TILES (16×16) ──────────────────────────────────────────────────────

// Deep water — gentle wave pattern with scattered highlights
sprite("water_base", `
  WWWwWWWWWWWWwWWW
  WWWWWuWWWWWWWWWW
  WWWWWWwWWWWuWWWW
  wWWuWWWWWWwWWWWW
  WWWWWWWWWWWWWWwW
  WWWWwWWuWWWWWWWW
  WWuWWWWWWWWwWWWW
  WWWWWWWWuWWWWWWW
  WWwWWWWWWWWWWwWW
  WWWWWuWWWWWWWWWW
  WWWWWWWWwWWuWWWW
  wWWWWWWWWWWWwWWW
  WWWuWWWWWWWWWWWW
  WWWWwWWWuWWWWWwW
  WWWWWWWWWWWWuWWW
  WWWWWWwWWWWWWWWW`)

// Water with shoreline (land at top, water below) — exactly 16px wide
sprite("water_shore_top", `
  GGdGGdGGGGdGGGGG
  dGddGGGGdGGGGddG
  EbbuuuWuubEEbuuW
  uuWWWWWWWWuuWWWW
  WWWWWwWWWWWWWWWW
  WWuWWWWWWWWWWuWW
  wWWWWWWWWWWwWWWW
  WWWWWWwWuWWWWWWW
  WWWwWWWWWWWWwWWW
  WWWWWuWWWWWWWWWW
  WWWWWWwWWWuWWWWW
  wWWWWWWWWWwWWWWW
  WWWuWWWWWWWWWuWW
  WWWWwWWWWWWWWWwW
  WWWWWWuWWWWWWWWW
  WWwWWWWWWwWWWuWW`)

// ── COBBLESTONE PATH (16×16) — visible individual stones ─────────────────────

sprite("cobble_path", `
  ssSzsSsSzsSssSzs
  sSSSSzSSSSSSSSSz
  zSSSSSSzSSzSSSSS
  sSssSSSsSssSsSsS
  SzSSsSzSSSSSzSSS
  SSSSSSSSzSSSSSSz
  sSsSsSsSsSsSsSsS
  SSSzSSSSSSSSzSSS
  zSSSSSSsSzSSSSzS
  sSsSsSSSsSsSsSsS
  SSSSzSSSSSSSSSSz
  SzSSSSzSSSSSzSSS
  sSsSsSsSsSsSsSsS
  SSSSSSSzSSSSSSzS
  zSSsSzSSSSzSSSSS
  sSsSsSsSsSsSsSsS`)

// ── TREE (16×32 prop, fits two tiles vertically) ─────────────────────────────

sprite("tree_oak", { w: 16, h: 32, outline: "K" },
  // Trunk (bottom section)
  rect(6, 22, 4, 10, "O"),
  vline(6, 22, 10, "k"),
  vline(7, 22, 10, "O"),
  vline(8, 22, 10, "o"),
  vline(9, 22, 10, "O"),
  // Trunk root flare
  px(5, 30, "k"), px(5, 31, "k"),
  px(10, 30, "O"), px(10, 31, "O"),

  // Crown — layered foliage blobs for organic shape
  // Back shadow layer
  circ(8, 12, 7, "f"),
  circ(10, 14, 4, "f"),
  // Main canopy
  circ(7, 10, 6, "L"),
  circ(10, 11, 4, "L"),
  circ(5, 12, 3, "L"),
  // Mid highlights
  circ(6, 9, 4, "l"),
  circ(9, 8, 3, "l"),
  circ(4, 11, 2, "l"),
  // Bright highlights (top-left, catching light)
  px(4, 6, "g"), px(5, 5, "g"), px(6, 6, "g"),
  px(3, 8, "g"), px(5, 7, "g"),
  px(4, 9, "g"),
  // Leaf cluster texture (break up smooth circles)
  px(11, 8, "f"), px(12, 10, "f"),
  px(10, 15, "f"), px(9, 16, "f"),
  px(3, 13, "L"), px(2, 11, "L"),
)

// Second tree variant — taller, narrower
sprite("tree_birch", { w: 16, h: 32, outline: "K" },
  // Trunk — pale birch wood
  rect(7, 20, 3, 12, "s"),
  vline(7, 20, 12, "S"),
  vline(8, 20, 12, "s"),
  vline(9, 20, 12, "s"),
  // Birch bark marks
  px(7, 22, "z"), px(8, 25, "z"), px(7, 28, "z"),

  // Crown — more vertical, lighter leaves
  circ(8, 10, 5, "L"),
  circ(8, 7, 4, "l"),
  circ(7, 12, 4, "L"),
  circ(9, 9, 3, "l"),
  // Highlights
  px(5, 5, "g"), px(6, 4, "g"), px(7, 5, "g"),
  px(5, 7, "g"),
  // Shadow side
  circ(10, 13, 2, "f"),
  px(11, 11, "f"),
)

// ── ROCKS ────────────────────────────────────────────────────────────────────

// Rounded boulder — mirrored for symmetry, with volumetric shading
sprite("rock_small", { mx: true, outline: "K" }, `
  .....ss
  ...ssss
  ..sSSSs
  .sSSSSS
  .SSzSSS
  .SzzSSS
  ..zzzzz`)

sprite("rock_large", { mx: true, outline: "K" }, `
  ......sss
  ....sssss
  ..ssSSSss
  .sSSSSSss
  sSSSSSSsS
  SSSSSSSSS
  SSzSSSSzS
  SzzSSSSzS
  .zzzzzzz.`)

sprite("rock_mossy", { base: "rock_small", swap: { s: "g", S: "G", z: "d" } })

// ── FLOWER DECORATIONS ──────────────────────────────────────────────────────

// Dandelion cluster — bigger flower heads for visibility
sprite("flower_dandelion", { w: 16, h: 16 },
  // Left flower
  px(4, 10, "d"), px(4, 9, "G"), px(4, 8, "G"),
  px(3, 7, "y"), px(4, 7, "y"), px(5, 7, "y"),
  px(3, 6, "y"), px(4, 6, "y"), px(5, 6, "y"),
  px(4, 5, "y"),
  px(3, 10, "G"),
  // Right flower (shorter)
  px(10, 11, "d"), px(10, 10, "G"), px(10, 9, "G"),
  px(9, 8, "y"), px(10, 8, "y"), px(11, 8, "y"),
  px(10, 7, "y"), px(11, 7, "y"),
  px(11, 10, "G"),
)

// Thistle — the game's namesake flower, prominent
sprite("flower_thistle", { w: 16, h: 16 },
  // Main stem
  px(7, 13, "d"), px(7, 12, "d"), px(7, 11, "G"), px(7, 10, "G"),
  // Flower head — spiky thistle shape
  px(5, 8, "p"), px(6, 8, "p"), px(7, 8, "p"), px(8, 8, "p"), px(9, 8, "p"),
  px(6, 7, "p"), px(7, 7, "p"), px(8, 7, "p"),
  px(7, 6, "p"), px(8, 6, "p"),
  px(7, 5, "p"),
  // Spiny bracts
  px(5, 9, "d"), px(6, 9, "G"), px(7, 9, "G"), px(8, 9, "G"), px(9, 9, "d"),
  // Leaves
  px(5, 12, "G"), px(6, 11, "G"),
  px(9, 11, "G"), px(8, 12, "G"),
)

// Poppy
sprite("flower_poppy", { w: 16, h: 16 },
  // Stem
  px(8, 13, "d"), px(8, 12, "G"), px(8, 11, "G"), px(7, 10, "G"),
  // Flower head — rounded petals
  px(6, 8, "r"), px(7, 8, "r"), px(8, 8, "r"), px(9, 8, "r"),
  px(6, 7, "r"), px(7, 7, "r"), px(8, 7, "r"), px(9, 7, "r"),
  px(7, 6, "r"), px(8, 6, "r"),
  px(7, 9, "r"), px(8, 9, "r"),
  // Dark center
  px(7, 8, "K"), px(8, 8, "K"),
  // Leaves
  px(6, 12, "G"), px(9, 11, "G"),
)

// ── SLIME MOB PROTOTYPE (24×24, 6cols × 4rows) ──────────────────────────────
// Quick prototype of a redesigned slime to test character/mob cohesion

sprite("_slime_body", { mx: true, outline: "K" }, `
  .......ggggg
  ....gggGGGGg
  ..ggGGGGGGGg
  .gGGGGGGGGGG
  gGGGRGGRGGGG
  gGGGKGGKGGGG
  gGGGGGGGGGGG
  gGdGGGGGGGdG
  .gddGGGGGddG
  ..gddddddGGG
  ...ddddddddd`)

sprite("slime_idle_0", { w: 24, h: 24 },
  stamp("_slime_body", 0, 6))
sprite("slime_idle_1", { w: 24, h: 24 },
  stamp("_slime_body", 0, 7))

// ── SPRITE SHEETS ────────────────────────────────────────────────────────────

sheet("meadow_tiles", [
  "grass_base", "grass_tuft", "grass_flowers",
  "dirt_base", "dirt_grass_top",
  "water_base", "water_shore_top",
  "cobble_path",
], { cols: 4, pad: 0 })

sheet("meadow_props", [
  "tree_oak", "tree_birch",
  "rock_small", "rock_large", "rock_mossy",
  "flower_dandelion", "flower_thistle", "flower_poppy",
], { cols: 4, pad: 1 })

sheet("slime_test", ["slime_idle_0", "slime_idle_1"], { cols: 2, pad: 0 })
