# Thistlevane — Art Bible

**Version:** 1.0 (Draft)
**Date:** 2026-11-15
**Reference:** Witchbrook (Chucklefish) as a quality benchmark — study its principles, never copy its assets.

---

## 1. Artistic Identity

Thistlevane is a **cozy medieval pixel MMORPG** rendered in a top-down perspective at 16x16 tile resolution with a native viewport of 320x220 pixels.

### Visual Pillars

1. **Warmth over Grit** — The world feels lived-in and inviting, not dark or hostile. Even dangerous zones should feel beautiful.
2. **Readable at Native Scale** — Every sprite, tile, and effect must read clearly at its actual game size. Detail that only shows when zoomed in is wasted.
3. **One World, One Voice** — A tree in the meadow and a tree in the frost peaks should look like they were drawn by the same artist, adapted for different biomes.
4. **Nature First** — The world is defined by its landscapes, flora, and fauna. Architecture and props serve the environment, not the other way around.
5. **Personality Through Silhouette** — Characters and creatures are recognizable from their outline alone, before colour or detail.

### What Thistlevane Is NOT

- Not grimdark — avoid desaturated, muddy palettes
- Not chibi/super-deformed — proportions should be charming but grounded
- Not retro-nostalgic — this is not an NES homage; use the full colour range thoughtfully
- Not Witchbrook — Thistlevane is top-down (not isometric), medieval-rural (not academic-magical), and smaller-scale (16px tiles vs Witchbrook's larger sprites)

---

## 2. Visual Inspiration & Differentiation

### From Witchbrook (study, don't copy)

| Principle | How Witchbrook Does It | How Thistlevane Adapts It |
|---|---|---|
| Environmental richness | Dense, layered isometric scenes with overlapping foliage | Top-down layering: ground → decor → objects → above-characters canopy |
| Warm lighting | Soft golden glows, warm interiors | Consistent top-left warm light source; shadow colours shift cool |
| Water treatment | Glistening rivers with skipping stones and ripples | Animated water tiles with gentle palette cycling; reflective highlights |
| Character personality | Expressive faces, distinct clothing silhouettes | Strong hair/hat silhouettes at 24x32; colour-coded character identity |
| Cozy atmosphere | Cafe scenes, potions classes, lived-in spaces | Village scenes, market stalls, garden plots, campfire clearings |

### From Other References

- **Stardew Valley** — Top-down 16px tile warmth and seasonal palette shifts
- **Eastward** — Rich environmental storytelling through prop density and lighting
- **CrossCode** — Readable character sprites at small scales with strong outlines
- **Celeste** — Atmospheric environments that use limited palettes powerfully

---

## 3. Master Colour Palette

### 3.1 Palette Philosophy

- **Hue-shift shadows cool, highlights warm** — Shadows shift toward blue/purple; highlights shift toward yellow/peach
- **3-4 value ramps per material** — At 16px, more than 4 values becomes noise
- **Saturation peaks in midtones** — Shadows and highlights are slightly desaturated relative to the base colour
- **Each biome gets a dominant hue family** with shared accent colours for cross-zone cohesion

### 3.2 Universal Colours (used across all biomes)

#### Outlines & Darks
| Name | Hex | Use |
|---|---|---|
| Deep Bark | `#2a1f2d` | Primary outline colour (characters, props) |
| Warm Black | `#1b1a22` | Background fill, UI darks (matches game config) |
| Shadow Plum | `#3d2845` | Deep shadows on all sprites |

#### Skin Tones (character palette)
| Name | Hex | Use |
|---|---|---|
| Skin Highlight | `#ffe0b8` | Brightest skin |
| Skin Base | `#d4a87a` | Mid skin |
| Skin Shadow | `#a06848` | Skin shadow |
| Skin Deep | `#6b3e30` | Darkest skin |

#### Metals & Stone
| Name | Hex | Use |
|---|---|---|
| Steel Highlight | `#c8d0dc` | Bright metal/stone |
| Steel Base | `#8a93a8` | Mid metal |
| Steel Shadow | `#5a5e78` | Dark metal |
| Rust Accent | `#a85e3c` | Aged metal, brick accents |

#### UI & Labels
| Name | Hex | Use |
|---|---|---|
| Label White | `#ffffff` | Name labels (remote players) |
| Label Gold | `#ffe9a8` | Name labels (local player) — from config |
| Label Stroke | `#1b1a22` | Label outline — from config |

### 3.3 Biome Palettes

#### Meadow (Thistlevane Meadow — starting zone, safe)

The emotional centre of the game. Warm, golden-green, inviting.

| Name | Hex | Use |
|---|---|---|
| Grass Highlight | `#a8d86a` | Sunlit grass tops |
| Grass Base | `#6aaa38` | Primary grass fill |
| Grass Shadow | `#3d7a28` | Grass in shade |
| Grass Deep | `#2a5c1e` | Dense undergrowth |
| Earth Light | `#d4b07a` | Dry paths, light dirt |
| Earth Base | `#a87d4a` | Standard dirt |
| Earth Shadow | `#785028` | Shadowed earth |
| Water Highlight | `#88ccee` | Water sparkle |
| Water Base | `#4a8ab8` | River/pond surface |
| Water Shadow | `#2a5a88` | Deep water |
| Water Deep | `#1a3858` | Deepest water |
| Flower Warm | `#e8a848` | Dandelions, warm wildflowers |
| Flower Cool | `#a868c8` | Thistles, lavender |
| Flower Bright | `#e85868` | Poppies, roses |
| Wood Light | `#c8a060` | Light timber |
| Wood Base | `#8a6838` | Standard wood |
| Wood Shadow | `#5a3e22` | Dark timber |
| Leaf Highlight | `#78c848` | Bright canopy |
| Leaf Base | `#4a9830` | Standard foliage |
| Leaf Shadow | `#2a6828` | Dense foliage shadow |
| Stone Light | `#b8b0a0` | Light stone, cobble |
| Stone Base | `#888070` | Standard stone |
| Stone Shadow | `#585048` | Dark stone |

#### Barren Grasslands (easy zone)

Drier and warmer than the meadow. Golden-yellow earth, sparse green.

| Name | Hex | Use |
|---|---|---|
| Dry Grass Highlight | `#c8c858` | Sunlit dry grass |
| Dry Grass Base | `#a0a040` | Dry grass fill |
| Dry Grass Shadow | `#787828` | Shaded dry grass |
| Arid Earth Light | `#d8b878` | Light sandy ground |
| Arid Earth Base | `#b89058` | Packed earth |
| Arid Earth Shadow | `#886838` | Shaded earth |
| Scrub Green | `#68883a` | Hardy scrub plants |

#### Wastelands (medium zone)

Hot, hostile desert with ochre and terracotta. Oasis water is a welcome cool contrast.

| Name | Hex | Use |
|---|---|---|
| Sand Highlight | `#e8d0a0` | Bright sand |
| Sand Base | `#c8a870` | Standard sand |
| Sand Shadow | `#a07848` | Shaded sand |
| Red Rock Light | `#c87848` | Sunlit canyon |
| Red Rock Base | `#985838` | Red rock face |
| Red Rock Shadow | `#683828` | Deep canyon shadow |
| Oasis Water | `#58a8c8` | Cool oasis blue |
| Oasis Deep | `#385878` | Deep oasis water |
| Cactus Green | `#58884a` | Desert vegetation |

#### Thistlevane Hollow (medium zone)

Deep enchanted forest. Rich greens and blue-grey atmosphere.

| Name | Hex | Use |
|---|---|---|
| Forest Floor Light | `#687848` | Moss-covered ground |
| Forest Floor Base | `#485838` | Dense forest floor |
| Forest Floor Shadow | `#303828` | Deep forest shade |
| Dark Bark | `#484040` | Ancient tree trunks |
| Dark Bark Shadow | `#302828` | Trunk shadow |
| Canopy Light | `#58a848` | Upper canopy catching light |
| Canopy Base | `#387838` | Dense canopy |
| Canopy Shadow | `#285028` | Canopy underlayer |
| Mist Blue | `#7888a0` | Atmospheric haze |
| Mushroom Warm | `#c88858` | Orange mushrooms |
| Mushroom Cool | `#8868a8` | Purple mushrooms |
| Cobble Light | `#787068` | Ancient stonework |
| Cobble Shadow | `#484038` | Dark stonework |

#### Frostvane Peaks (hard zone)

Cold, harsh, beautiful. Blue-grey palette with ice accents.

| Name | Hex | Use |
|---|---|---|
| Snow Highlight | `#e8e8f0` | Bright snow |
| Snow Base | `#c0c8d8` | Standard snow |
| Snow Shadow | `#8898b0` | Shaded snow |
| Ice Highlight | `#a8d8f0` | Bright ice |
| Ice Base | `#6898c0` | Standard ice |
| Ice Shadow | `#486888` | Deep ice |
| Frost Rock Light | `#98a0b0` | Light mountain rock |
| Frost Rock Base | `#687080` | Standard rock |
| Frost Rock Shadow | `#484858` | Dark rock |
| Pine Dark | `#285038` | Frost pine foliage |
| Pine Light | `#488858` | Pine in sunlight |

---

## 4. Outline Rules

### Primary Outlines
- **Colour:** `#2a1f2d` (Deep Bark) — not pure black; a warm very-dark purple
- **Thickness:** 1 pixel, always
- **Where:** Characters, mobs, standalone props (trees, rocks, buildings)
- **Inner outlines:** Sparingly, only for major internal forms (belt line, cape edge); never for texture detail

### Tile Outlines
- **Terrain tiles do NOT have hard outlines** — they blend through colour transitions
- **Exception:** Cliff edges and elevated terrain use a 1px darker border to show elevation change
- **Props on tiles** (flowers, small stones) use selective outlines — outline only the side facing away from the light source

### Outline Colour Variation
- In bright/warm areas, outlines may use `#3d2845` (Shadow Plum) instead of Deep Bark for a softer feel
- In Frostvane Peaks, outlines shift to `#383848` (cool dark blue-grey) to match the biome temperature

---

## 5. Lighting Direction

### Global Light: Top-Left (↘ shadow direction)

All sprites and tiles assume light comes from the **upper-left** at approximately 45 degrees.

- **Highlights:** Top and left edges of forms
- **Shadows:** Bottom and right edges of forms
- **Cast shadows:** Short, to the bottom-right (1-2 pixels for small objects, 2-3 for trees/buildings)

### Consistent across all assets
- Every character, mob, tree, building, and prop follows this lighting
- Tile terrain uses subtle value shifts: top-left of tile is slightly lighter than bottom-right

### Indoor / Cave exceptions
- Not yet applicable (no interiors implemented)
- When added: use ambient lighting with no strong directional bias; slightly cooler palette

---

## 6. Pixel Density & Rendering Rules

### Resolution
- **Tile size:** 16 x 16 pixels
- **Character frames:** 24 x 32 pixels (1.5 tiles wide, 2 tiles tall)
- **Small mob frames:** 24 x 24 pixels (1.5 tiles square)
- **Large mob frames:** 32 x 32 pixels (2 tiles square)
- **Effect frames:** 16 x 16 pixels (1 tile square)
- **Viewport:** 320 x 220 pixels
- **Rendering:** Nearest-neighbour upscaling only; no bilinear filtering

### Pixel Integrity
- **Every pixel must be intentional** — no anti-aliasing, no sub-pixel rendering
- **No blurry edges** — transparent backgrounds must have clean 1px edges
- **No doubles:** Avoid placing two identical-colour pixels where one would read the same
- **Consistent density:** A 16px tile should have roughly the same level of detail as any other 16px tile; don't make one tile hyper-detailed and its neighbour flat

### Dithering
- **Minimal dithering** — use sparingly for texture on large surfaces (stone walls, sandy ground)
- **Pattern:** Checkerboard or ordered dithering only; no random noise
- **Where appropriate:** Ground texture transitions, atmospheric fog, water reflections
- **Where NOT:** Character sprites, mob sprites, small props, UI elements

---

## 7. Character Proportions

### Body Standard (24 x 32 frame)

Characters use a **~3-head proportion** — head is roughly 1/3 of total height.

```
Approximate layout within 24x32 frame:
┌────────────────────────┐
│      Hair/Hat          │ rows 0-3   (4px) — hair and headwear define silhouette
│      Head/Face         │ rows 4-9   (6px) — face, eyes (2px wide), simple features
│      Torso             │ rows 10-18 (9px) — clothing, arms, accessories
│      Legs/Feet         │ rows 19-28 (10px) — pants/skirt, shoes
│      (foot margin)     │ rows 29-31 (3px) — grounding space + footOffsetY
└────────────────────────┘
Width: body 10-14px centred, arms extend to ~16px when swinging
```

### Character Differentiation
Each character should be identifiable by silhouette alone:
- **Rowan:** Messy hair, adventurer's cloak
- **Lilac:** Pointed hat, flowing robe
- **Pip:** Cat ears, short/compact build, tail
- **Ash:** Tall collar, lantern glow, white hair

### Face Details
At 24px wide, faces are very limited:
- Eyes: 2px wide, 1px apart (2-3px from top of head area)
- No visible mouth at idle; simple 1px line when animated
- Skin colour and hair shape carry most of the identity

---

## 8. Mob Design Principles

### Silhouette First
Every mob must have a unique, readable silhouette:
- **Round** (slime, wisp) vs **Tall** (myconid, cactus) vs **Wide** (crocodile, wolf) vs **Spiky** (thistle, scorpion)
- No two mobs in the same zone should share the same basic shape

### Size Categories
| Size | Frame | Examples | Visual Scale vs Character |
|---|---|---|---|
| Small | 24 x 24 | Slime, wisp, hare | Shorter than character, ~12-16px actual sprite |
| Large | 32 x 32 | Wolf, stag, troll | Taller/wider than character, ~20-28px actual sprite |

### Animation Requirements
- **Idle:** 2 frames — subtle breathing/bobbing, NOT static
- **Walk:** 4 frames — clear locomotion appropriate to the creature type
- **All 4 directions:** down, left, right, up — each must read correctly
- Mobs do NOT have run animations (only walk)

### Colour Approach
- Each mob's palette should relate to its biome
- Meadow mobs: warm greens, earth tones, flower accents
- Wasteland mobs: ochre, terracotta, dusty yellow
- Hollow mobs: deep green, purple, mushroom tones
- Frost mobs: blue-grey, ice blue, white

---

## 9. Environment & Terrain Design

### Grass
- **Minimum 3 variations** per biome to break repetition
- Base tile + 2-3 decoration variants (tufts, small flowers, pebbles)
- Grass colour shifts subtly between tiles — never perfectly uniform
- Edge grass tiles transition naturally into adjacent terrain

### Paths & Roads
- Dirt paths: 2-3px worn-down centre line, grass encroaching at edges
- Stone paths: individual cobbles visible, slight colour variation per stone
- Transitions: gradient tiles where path meets grass (never hard lines)

### Water
- **4-frame animated cycle** minimum
- Colour ramp: highlight → base → shadow → deep (4 values)
- Edge tiles: shoreline with foam/wave detail, not a straight colour cut
- Reflective highlights: 1-2 bright pixels that shift position across frames

### Trees
- **Crown and trunk as separate visual zones**
- Crown: 2-3 foliage colours (highlight, base, shadow) with visible leaf clusters
- Trunk: 2-3 wood colours, slight bark texture
- Cast shadow: 2-3 darkened ground pixels to the bottom-right
- Multiple tree variants per biome (at least 2 shapes)

### Rocks
- **Rounded, volumetric forms** — not flat coloured blobs
- 3 value ramp: highlight face (top-left), base, shadow face (bottom-right)
- Small rocks (decorative): 4-6px, fit within one tile
- Large rocks (blocking): 12-16px, may span visual space of 1-2 tiles

### Cliffs & Elevation
- Cliff faces use a darker value ramp than flat ground
- Top edge: hard 1px line (elevation boundary)
- Face: vertical texture lines suggesting rock strata
- Ramp tiles: diagonal gradient between elevation levels

---

## 10. Building Architecture

### Style: Medieval-Rural Cottage
- Timber-frame construction with plaster/stone infill
- Thatched or slate roofs
- Small windows (2-3px), wooden shutters
- Doors: single-width (1 tile) with visible frame

### Proportions
- Buildings should feel grounded and proportional to characters
- A door should be roughly character-height (2 tiles, 32px)
- Roofs: 45-degree pitch, 2-3 tiles of overhang
- Walls: 1-3 tiles of visible face

### Consistency
- All buildings in a zone share the same wall material and roof style
- Cross-zone variation through material palette (meadow: warm wood + thatch; frost: dark wood + slate; hollow: mossy stone + overgrown)

---

## 11. Water & Environmental Animation

### Water Tiles
- **4-frame loop** at ~4fps (250ms per frame)
- Frame 1: neutral base
- Frame 2-3: highlights shift 1px laterally (simulates flow)
- Frame 4: return toward neutral with slight sparkle
- Deep water has slower, more subtle animation than shallow

### Foliage Animation (reaction-based)
- Trees rustle when a player passes adjacent tiles (already supported via `rustleAnimation` tile property)
- Rustle: 3-4 frames, crown shifts 1px, returns — timing ~80ms/frame
- Flowers bob when stepped on (via `stepAnimation`)

### Future Ambient (not yet implemented)
- Firefly particles in hollow zones
- Falling snow in frost zones
- Grass sway in meadow (would require animated tile layer support)

---

## 12. Sprite Sheet Standards

### Characters (24 x 32 per frame)
```
Sheet layout: 22 columns × 4 rows = 88 frames
Total sheet: 528 × 128 px

Row 0: Facing Down    | cols 0-5: idle (6f) | cols 6-13: walk (8f) | cols 14-21: run (8f)
Row 1: Facing Left    | cols 0-5: idle (6f) | cols 6-13: walk (8f) | cols 14-21: run (8f)
Row 2: Facing Right   | cols 0-5: idle (6f) | cols 6-13: walk (8f) | cols 14-21: run (8f)
Row 3: Facing Up      | cols 0-5: idle (6f) | cols 6-13: walk (8f) | cols 14-21: run (8f)
```

### Mobs — Small (24 x 24 per frame)
```
Sheet layout: 6 columns × 4 rows = 24 frames
Total sheet: 144 × 96 px

Row 0: Facing Down    | cols 0-1: idle (2f) | cols 2-5: walk (4f)
Row 1: Facing Left    | cols 0-1: idle (2f) | cols 2-5: walk (4f)
Row 2: Facing Right   | cols 0-1: idle (2f) | cols 2-5: walk (4f)
Row 3: Facing Up      | cols 0-1: idle (2f) | cols 2-5: walk (4f)
```

### Mobs — Large (32 x 32 per frame)
```
Sheet layout: 6 columns × 4 rows = 24 frames
Total sheet: 192 × 128 px

Row 0: Facing Down    | cols 0-1: idle (2f) | cols 2-5: walk (4f)
Row 1: Facing Left    | cols 0-1: idle (2f) | cols 2-5: walk (4f)
Row 2: Facing Right   | cols 0-1: idle (2f) | cols 2-5: walk (4f)
Row 3: Facing Up      | cols 0-1: idle (2f) | cols 2-5: walk (4f)
```

### Effects (16 x 16 per frame)
```
Sheet: 96 × 64 px (6 columns × 4 rows = 24 frames)
Effects are laid out sequentially; each effect starts at a defined startFrame.
```

### Tilesets
```
Width: 256 px (16 tiles per row)
Height: variable (11 rows for meadow up to 122 rows for large zones)
Tile: 16 × 16 px
No padding or spacing between tiles
```

---

## 13. Animation Consistency Rules

1. **Character volume must not change between frames** — the silhouette area should stay within ±2 pixels
2. **Feet stay planted on the ground line** — no vertical bouncing unless intentional (slimes)
3. **Walk cycles should have clear contact and passing poses** — even at 8 frames, the stride should read
4. **Run cycles must be faster, not just walk-at-double-speed** — wider stride, more arm swing, slight forward lean
5. **Idle animations are subtle** — breathing, weight shift, hair/cape drift — NOT exaggerated bobbing
6. **Left/right frames can be mirrors** (horizontally flipped) for mobs, but characters should have hand-made left/right for asymmetric clothing details
7. **Frame timing is defined in data** — the art must work at the configured frameRate (not faster or slower)

---

## 14. Asset Export Requirements

### Format
- **PNG-8 or PNG-32** with transparency
- **No compression artifacts** — save with maximum quality
- **Nearest-neighbour only** — never resize with bilinear/bicubic

### Transparency
- Background: fully transparent (alpha = 0)
- No semi-transparent pixels (alpha must be 0 or 255)
- Exception: effects (dust, splash) may use 1-2 levels of alpha for fade-out

### File Naming
- Characters: `assets/characters/{id}.png` (lowercase, matches `characters.json`)
- Mobs: `assets/mobs/{id}.png` (lowercase underscore, matches `mobs.json`)
- Tilesets: `assets/tilesets/{zone_id}.png` (matches zone tileset name)
- Effects: `assets/effects/effects.png` (single shared sheet)

### Pre-delivery Checklist
- [ ] Correct frame dimensions (measured, not assumed)
- [ ] Correct number of columns and rows
- [ ] Transparent background (no stray pixels)
- [ ] No anti-aliased or blurry edges
- [ ] Colours match the biome palette (spot-check with eyedropper)
- [ ] Outline colour is correct (`#2a1f2d` or approved variant)
- [ ] Lighting direction consistent (top-left highlight, bottom-right shadow)
- [ ] Animation frames maintain consistent volume/proportion
- [ ] Asset readable at 1x (native game size)

---

## 15. Quality Benchmarks

### "Does It Belong?" Test
Place the new asset next to existing approved assets. If it looks like it came from a different game, revise it.

### Readability Test
View the asset at 1x resolution (no zoom). Can you identify:
- What it is?
- Which direction it faces?
- Whether it's moving or idle?

If any answer is "not sure," the design needs more contrast or a clearer silhouette.

### Palette Test
Eyedrop 5 random pixels from the asset. Do they all appear in the approved biome palette? If not, either the palette needs expanding (with justification) or the asset needs correction.

### Neighbour Test
Place the tile next to every tile it could border in-game. Do the transitions look natural? Are there visible seam lines or colour jumps?
