# Thistlevane — Asset Inventory (Milestone 1 Audit)

**Date:** 2026-11-15
**Status:** Initial audit complete

---

## Engine & Pipeline

| Property | Value |
|---|---|
| Engine | Phaser 4 (via npm `phaser`) |
| Renderer | WebGL (Phaser default) |
| Language | TypeScript (strict) |
| Build tool | Vite (client), tsx (server) |
| Tile format | Tiled JSON (embedded tilesets, CSV/array layer data) |
| Image format | PNG (all assets) |
| Tile size | 16 x 16 px (universal across all maps) |
| View resolution | 320 x 220 px (config: `targetViewWidth`/`targetViewHeight`) |
| Pixel art mode | Nearest-neighbour rendering (Phaser pixel art config) |

### Asset loading
- Data files: `assets/data/*.json` fetched at startup, validated with shared schemas
- Tilesets: loaded on-demand when entering a zone, referenced by Tiled map JSON
- Sprites: loaded via Phaser's `scene.load.spritesheet` using data-defined frame dimensions
- Effects: single shared spritesheet (`effects/effects.png`), frame-based animation

### Sprite pipeline
- Characters and mobs share `EntitySprite.ts` — a single class driven by `SpriteDefinition`
- Sprite key convention: `{kind}:{id}` (e.g. `character:rowan`, `mob:slime`)
- Animation key: `{kind}:{id}:{anim}:{direction}` (e.g. `character:rowan:walk:down`)
- Anchor/origin: data-defined per sprite (`anchor.x`, `anchor.y`)
- Foot offset: `footOffsetY` adjusts vertical placement relative to tile bottom
- Y-sort depth: entities sorted by foot Y position (lower = drawn in front)

---

## Character Sprites

All 4 characters share identical sprite sheet layout and dimensions.

| Character | File | Sheet Size | Frame | Cols x Rows | Animations |
|---|---|---|---|---|---|
| Rowan (Thistle Wayfarer) | `assets/characters/rowan.png` | 528 x 128 | 24 x 32 | 22 x 4 | idle(6f), walk(8f), run(8f) |
| Lilac (Hedge Mage) | `assets/characters/lilac.png` | 528 x 128 | 24 x 32 | 22 x 4 | idle(6f), walk(8f), run(8f) |
| Pip (Cat-folk Courier) | `assets/characters/pip.png` | 528 x 128 | 24 x 32 | 22 x 4 | idle(6f), walk(8f), run(8f) |
| Ash (Lantern Scholar) | `assets/characters/ash.png` | 528 x 128 | 24 x 32 | 22 x 4 | idle(6f), walk(8f), run(8f) |

**Shared character spec:**
- Frame: 24 x 32 px
- 22 columns per row
- 4 rows: down, left, right, up
- Anchor: (0.5, 0.9375)
- Foot offset: -2 px
- Animations: idle (cols 0-5, 5fps), walk (cols 6-13, 14fps), run (cols 14-21, 20fps)
- Effects: dust-small (walk), dust-large (run)

### Character visual problems
- **Rowan:** Readable silhouette but chunky proportions; limited color depth; outline inconsistent between frames
- **Lilac:** Teal/purple palette feels disconnected from other characters; hair reads as a solid block
- **Pip:** Cat-folk design is mostly a color swap of the human body type; ears lack definition at 24px width
- **Ash:** Purple robe has decent shading; proportions consistent with others; best of the four
- **General:** All characters look like they were generated with different color palettes but the same template; they lack individual personality in silhouette; shading is flat with minimal color ramp depth; outlines vary in thickness and darkness between characters

---

## Mob Sprites

All 15 mobs are marked `"placeholder": true` in data. Two frame sizes exist.

### Small mobs (24 x 24 px frame, 144 x 96 sheet, 6 cols x 4 rows)

| Mob | File | Animations | Walk speed |
|---|---|---|---|
| Slime | `assets/mobs/slime.png` | idle(2f), walk(4f) | 8 ticks |
| Grass Thistle | `assets/mobs/grass_thistle.png` | idle(2f), walk(4f) | 10 ticks |
| Chomper Plant | `assets/mobs/chomper_plant.png` | idle(2f), walk(4f) | 12 ticks |
| Scorpion | `assets/mobs/scorpion.png` | idle(2f), walk(4f) | 6 ticks |
| Walking Cactus | `assets/mobs/walking_cactus.png` | idle(2f), walk(4f) | 9 ticks |
| Thorny Flower | `assets/mobs/thorny_flower.png` | idle(2f), walk(4f) | 12 ticks |
| Wisp | `assets/mobs/wisp.png` | idle(2f), walk(4f) | 5 ticks |
| Myconid | `assets/mobs/myconid.png` | idle(2f), walk(4f) | 9 ticks |
| Web Spider | `assets/mobs/web_spider.png` | idle(2f), walk(4f) | 5 ticks |
| Ice Wisp | `assets/mobs/ice_wisp.png` | idle(2f), walk(4f) | 5 ticks |
| Snow Hare | `assets/mobs/snow_hare.png` | idle(2f), walk(4f) | 4 ticks |

### Large mobs (32 x 32 px frame, 192 x 128 sheet, 6 cols x 4 rows)

| Mob | File | Animations | Walk speed |
|---|---|---|---|
| Desert Crocodile | `assets/mobs/desert_crocodile.png` | idle(2f), walk(4f) | 7 ticks |
| Frost Wolf | `assets/mobs/frost_wolf.png` | idle(2f), walk(4f) | 4 ticks |
| Hollow Stag | `assets/mobs/hollow_stag.png` | idle(2f), walk(4f) | 5 ticks |
| Snow Troll | `assets/mobs/snow_troll.png` | idle(2f), walk(4f) | 8 ticks |

### Mob visual problems
- **All mobs are placeholders** — every single one is marked `placeholder: true`
- **Silhouettes are poor:** Most small mobs are indistinguishable blobs at game resolution; the slime, wisp, ice_wisp, and chomper_plant are nearly identical round shapes
- **Directional art is weak:** Most mobs look the same from all 4 directions; the scorpion and desert_crocodile are side-view creatures that don't rotate convincingly
- **Color palettes are isolated:** Each mob uses its own unrelated palette with no shared harmony
- **Animation is minimal:** Only 2 idle frames and 4 walk frames per mob; idle is barely perceptible
- **Large mobs (32x32) vs characters (24x32):** The scale relationship is reasonable but inconsistent — a frost wolf at 32x32 should be wider, not just equally proportioned in a bigger box
- **No personality:** Walking cactus, grass thistle, and thorny flower are all just colored circles with features; they need distinct anatomy and silhouette language

---

## Effects

| Effect | Sheet | Frame | Frames | Rate | Layer |
|---|---|---|---|---|---|
| dust-small | `assets/effects/effects.png` | 16 x 16 | 4 frames (start 0) | 14fps | below |
| dust-large | `assets/effects/effects.png` | 16 x 16 | 5 frames (start 6) | 16fps | below |
| leaves | `assets/effects/effects.png` | 16 x 16 | 6 frames (start 12) | 14fps | above |
| splash | `assets/effects/effects.png` | 16 x 16 | 6 frames (start 18) | 16fps | above |

Sheet: `assets/effects/effects.png` — 96 x 64 px (6 cols x 4 rows of 16x16 frames)

### Effects visual problems
- Effects are barely visible at native resolution — very faint/subtle
- The dust effects read as slight smudges rather than particle puffs
- Leaves and splash effects are similarly hard to see
- Color palette doesn't match any specific environment

---

## Tilesets

| Tileset | File | Size | Tiles (16x16) | Zone |
|---|---|---|---|---|
| meadow | `assets/tilesets/meadow.png` | 256 x 176 | 16 x 11 = 176 | Thistlevane Meadow |
| meadow-old | `assets/tilesets/meadow-old.png` | 256 x 176 | 16 x 11 = 176 | (backup/unused) |
| thistlevane_hollow | `assets/tilesets/thistlevane_hollow.png` | 256 x 1952 | 16 x 122 = 1,952 | Thistlevane Hollow |
| barren_grasslands | `assets/tilesets/barren_grasslands.png` | 256 x 1824 | 16 x 114 = 1,824 | The Barren Grasslands |
| wastelands | `assets/tilesets/wastelands.png` | 256 x 1952 | 16 x 122 = 1,952 | The Wastelands |
| frostvane_peaks | `assets/tilesets/frostvane_peaks.png` | 256 x 944 | 16 x 59 = 944 | Frostvane Peaks |

### Tileset visual problems
- **meadow:** Very small tileset (176 tiles) — limited environmental variety; grass is flat single-shade; water uses harsh blue autotiles with visible grid seams; fences and bridges are functional but lack charm; trees at bottom are tiny and lack foliage depth
- **thistlevane_hollow:** Large tileset (1,952 tiles) with extensive terrain autotiling; dark forest theme has a dense feel but tiles are muddy and lack contrast; stone paths blend into ground; trees at the bottom have better silhouettes than meadow; overall green palette is monotonous
- **barren_grasslands:** Dry/arid theme with yellow-brown earth and blue water; transitions between terrain types are visible as grid artifacts; grass patches use too-saturated yellow-green against brown ground; water is bright blue against earth tones — feels disconnected
- **frostvane_peaks:** Ice/snow theme with grey-blue palette; the most cohesive tileset visually; snow and ice tiles transition reasonably well; dark rock/cliff faces have decent contrast; pine trees at bottom are tiny but stylistically consistent
- **wastelands:** Desert/wasteland with orange-brown dominant; water oases use bright cyan that clashes with the warm earth tones; terrain variety is good but the palette has too many similar mid-tones, reducing readability
- **Cross-tileset consistency:** Each zone's tileset was clearly made independently; the tree/prop sprites at the bottom of each tileset use completely different art styles; there is no shared artistic language between zones

---

## Maps (Tiled JSON)

| Zone | File | Size (tiles) | Tileset | Layers |
|---|---|---|---|---|
| Thistlevane Meadow | `assets/maps/meadow.json` | 80 x 56 | meadow | 7 (5 tile + 2 object) |
| Main Town | `assets/maps/test-map.json` | 40 x 30 | placeholder-tiles | 5 (3 tile + 2 object) |
| The Barren Grasslands | `assets/maps/barren_grasslands.json` | 500 x 500 | barren_grasslands | 7 |
| The Wastelands | `assets/maps/wastelands.json` | 500 x 500 | wastelands | 7 |
| Thistlevane Hollow | `assets/maps/thistlevane_hollow.json` | 500 x 500 | thistlevane_hollow | 7 |
| Frostvane Peaks | `assets/maps/frostvane_peaks.json` | 500 x 500 | frostvane_peaks | 7 |

**Standard layer structure** (large maps): ground, decor, objects, above, collision, spawns (objects), portals (objects)

**Map scale note:** The meadow (80x56 = 4,480 tiles) and test-map (40x30 = 1,200 tiles) are small dev maps. The four major zones are all 500x500 (250,000 tiles each) — substantial worlds. The client uses a sliding window renderer (`MapView.ts`) that only loads a chunk around the camera.

---

## Placeholder Assets (client/public)

| File | Size | Purpose |
|---|---|---|
| `client/public/assets/sprites/placeholder-hero.png` | (old placeholder) | Referenced by test-map.json |
| `client/public/assets/tilesets/placeholder-tiles.png` | (old placeholder) | Referenced by test-map.json only |

These are legacy placeholders from before the data-driven content system. Only `test-map.json` (Main Town zone) still references the old placeholder tileset.

---

## Missing Asset Categories

The following asset types do not exist yet:
- **NPC sprites** — no non-player characters
- **Buildings/structures** — no dedicated building sprites (some are baked into tilesets)
- **Weapons/equipment** — no items exist
- **UI pixel art** — no HUD, menus, or UI art
- **Item icons** — no inventory or item system
- **Environmental props** — limited to what's embedded in tilesets (trees, rocks, flowers)
- **Animated tiles** — tile animations are defined per-tile in Tiled properties but only as reaction animations (step/rustle), not ambient

---

## Technical Constraints for Redesign

1. **Tile size is 16x16 px** — all tilesets must use this grid
2. **Character frames are 24x32 px** — 22 columns, 4 directional rows; 3 animation states (idle/walk/run)
3. **Small mob frames are 24x24 px** — 6 columns, 4 rows; 2 states (idle/walk)
4. **Large mob frames are 32x32 px** — 6 columns, 4 rows; 2 states (idle/walk)
5. **Effect frames are 16x16 px** — single shared spritesheet
6. **Tileset width is 256 px** (16 tiles per row) — all tilesets follow this
7. **Tilesets are embedded** in map JSON — no external TSX files
8. **Anchor/foot positions** are data-driven — must match if frame size changes
9. **Tile properties** (collides, walkable, ramp, level, stepEffect, rustleAnimation, etc.) are embedded in tilesets — must be preserved or remapped
10. **Maps reference tilesets by relative path** — changing tileset filenames requires updating map JSON

---

# Redesigned assets — update 2026-11-16

The character sheets listed above were replaced by the 8-direction redesign
(`assets/prototype/*-redesign.px.js`, built with the pxl skill) and then extended
with a combat animation. Two new sheets joined them.

## Character spritesheets (current)

| Character | File | Sheet | Frame | Cols x Rows | Animations |
|---|---|---|---|---|---|
| Rowan (Thistle Wayfarer) | `assets/characters/rowan.png` | 624 x 256 | 24 x 32 | 26 x 8 | idle(6f), walk(8f), run(8f), **attack(4f)** |
| Lilac (Hedge Mage) | `assets/characters/lilac.png` | 624 x 256 | 24 x 32 | 26 x 8 | idle(6f), walk(8f), run(8f), **attack(4f)** |
| Pip (Cat-folk Courier) | `assets/characters/pip.png` | 624 x 256 | 24 x 32 | 26 x 8 | idle(6f), walk(8f), run(8f), **attack(4f)** |
| Ash (Lantern Scholar) | `assets/characters/ash.png` | 624 x 256 | 24 x 32 | 26 x 8 | idle(6f), walk(8f), run(8f), **attack(4f)** |

- Rows (unchanged): down, left, right, up, down-left, down-right, up-left, up-right
- Columns: idle 0-5 (5fps) · walk 6-13 (14fps) · run 14-21 (20fps) · attack 22-25 (14fps, plays once)
- Anchor (0.5, 0.9375), foot offset -2 px — unchanged, so nothing had to move in the scene
- Each character swings their own weapon, drawn only during the attack frames:
  Rowan a short sword, Pip a dagger (shorter reach), Lilac a branch wand with a
  leaf-light tip, Ash a lantern rod with an amber glow.

## Combat effects — `assets/effects/combat.png`

| Property | Value |
|---|---|
| Sheet | 120 x 72 px, 24 x 24 frames, 5 columns |
| `slash` | frames 0-4, 20fps — the weapon arc, played a tile ahead of the attacker |
| `impact` | frames 5-9, 22fps — hit spark, played on the defender |
| `target-ring` | frame 10, single frame — the selection ring, pulsed by a tween |

Source: `assets/prototype/combat-fx.px.js`. Kept separate from the older
`effects/effects.png` (dust, leaves, splash) so that placeholder sheet can be
replaced on its own.

## HUD icons — `assets/ui/icons.png`

| Property | Value |
|---|---|
| Sheet | 96 x 16 px, six 16 x 16 cells, drawn at 2x in the hotbar |
| Cells | 0 strike (sword) · 1 thistle bolt · 2 guard (shield) · 3 dash (boot) · 4 salve (flask) · 5 lantern |

Source: `assets/prototype/ui-icons.px.js`. Referenced from CSS
(`client/index.html`), not through Phaser, so it needs no data entry.

## Data changes

- `characters.json`: `columns` 22 -> 26, `animations.attack`, `effects.attackHit`,
  and a `combat` block (maxHp/maxMp/attack/defense) per character.
- `mobs.json`: every mob gained `level` and a `combat` block; levels run 1 (Slime)
  to 20 (Snow Troll) roughly in zone order.
- `effects.json`: `slash`, `impact` and `target-ring` entries.
