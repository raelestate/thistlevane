# Thistlevane — map tilesets

Five **16 × 16** tilesets, one per biome, in `assets/tilesets/`. The atlas is 16 tiles wide (256 px), no margin and
no spacing — the same shape as the `barren_grasslands.png` already in your project, so these drop in where that one
sits. Each set ships as a PNG atlas, a Tiled tileset (`.tsj`) with working terrain brushes, and an entry in
`tilesets.json` for engines that don't read Tiled files. A demo map is included for each so you can see the whole
set assembled.

| Biome | id | Terrains | Liquid | Tiles | Atlas | Props |
|---|---|---|---|---|---|---|
| Meadow | `meadow` | grass, lush grass, path | water | 256 | 256 × 256 | 19 |
| Barren Grasslands | `barren_grasslands` | grass, dirt, stone | water | 256 | 256 × 256 | 21 |
| Thistlevane Hollow | `thistlevane_hollow` | moss, loam, old stone | water | 288 | 256 × 288 | 25 |
| Frostvane Peaks | `frostvane_peaks` | snow, bare rock, ice | water | 272 | 256 × 272 | 22 |
| Wastelands | `wastelands` | ash, cracked earth, dust | lava | 256 | 256 × 256 | 24 |

```
assets/tilesets/<biome>.png        the atlas: 16 columns, 16×16 tiles, no margin, no spacing
assets/tilesets/<biome>.tsj        Tiled tileset: per-tile properties + 3 terrain brushes
assets/tilesets/tilesets.json      the same data without Tiled's conventions
assets/tilesets/demo_<biome>.png   a 40×26 map built from the set
assets/tilesets/demo_<biome>.tmj   that map as a Tiled map you can open and edit
assets/tilesets_64/                the identical sets at 64×64, if you ever scale the game up
```

Tile IDs are 0-based, left to right then top to bottom. In a `.tmj` the layer data is `firstgid + id`, so with a
single tileset at `firstgid: 1` a cell value of 0 means empty and 1 means tile 0.

## What's in a set

Every tile carries a `role` property, both in the `.tsj` (as a Tiled custom property) and in `tilesets.json` (as a
field on `tiles[i]`).

| role | count | fields | what it is |
|---|---|---|---|
| `ground` | 18 | `terrain`, `label` | 6 seamless variants of each of the 3 terrains |
| `transition` | 94 | `top`, `bottom`, `code` | two 47-tile blob sets, one per terrain pair |
| `liquid` | 6 | `terrain`, `label` | 6 variants of water (or lava) |
| `shore` | 47 | `top`, `bottom`, `code` | the land-over-liquid blob set, with shallows |
| `cliff` | 25 | `part` | an elevation edge, see below |
| `detail` | 4 | `label` | transparent scatter overlays: pebbles, tufts, flowers, bones… |
| `prop` | 46–81 | `prop`, `index`, `cell`, `size` | trees, rocks, ruins; one tile of a larger block |
| `empty` | 5–16 | — | padding at the end of the atlas; never place these |

Six ground variants per terrain, not four: at 16 px a tile is small enough that four repeats are visible in an open
field. Scatter them at random and a large area reads as texture rather than as a pattern. All of them tile
seamlessly against themselves and against each other.

## Terrain transitions

The transition tiles are a **47-tile blob set**. Each tile is one case of an 8-bit neighbour code, bit order N, NE,
E, SE, S, SW, W, NW, where a set bit means "the neighbour on that side is the same terrain as me". Diagonal bits
only count when both of their adjoining edges are also set, which is what reduces 256 cases to 47. The code is on
the tile as `code`.

A transition tile is **opaque and complete**: it draws the upper terrain covering most of the tile with the lower
terrain showing along the open sides, plus a lip of light on the upper-left edge, a one-step shadow on the
lower-right and, on grassy terrains, blades hanging over the lower edge. Place it *instead of* the ground tile, not
on a layer above one.

Shore tiles work the same way, with one addition: the water inside them steps up two palette levels against the
land, so a coastline reads as shallows rather than as a cut.

**In Tiled**, you don't have to compute any of this. Each set is exported as a wang set of `type: "mixed"`, so it
shows up under *Terrain Sets* — pick the brush, pick the colour, and paint. Each biome has three: two land pairs and
one shoreline.

**In your own engine**, the lookup is:

```python
BITS = [(0,-1), (1,-1), (1,0), (1,1), (0,1), (-1,1), (-1,0), (-1,-1)]

def code_for(grid, x, y, terrain):
    c = 0
    for i, (dx, dy) in enumerate(BITS):
        if grid[y+dy][x+dx] == terrain:        # off-map counts as the same
            c |= 1 << i
    for bit, (a, b) in ((1,(0,2)), (3,(2,4)), (5,(4,6)), (7,(6,0))):
        if not ((c >> a) & 1 and (c >> b) & 1):
            c &= ~(1 << bit)                   # drop a corner without its edges
    return c
```

Then index `{(t['top'], t['bottom']): {t['code']: i}}` built from the manifest. Code 255 means "surrounded", so use
a plain `ground` variant there instead.

Which terrain goes on top matters: the pair `("grass", "dirt")` draws grass over dirt, so grass is the terrain that
spreads and dirt is the one that shows through. `tilesets.json → biomes.<id>.tiles[i].top / .bottom` tells you which
is which, and the pairs available per biome are the `transition` roles.

## Cliffs

25 tiles for one elevation edge, laid out as named parts:

```
top_tl   top_t    top_tr      plateau surface, with the break along the left/right edge
top_c                         plateau interior (any amount of it, above the ledge)
in_il    in_ir                inner corners for the surface
lip_bl   lip_b    lip_br      turf breaking over the top course of rock
face_fl  face_f   face_fr     the rock wall
base_sl  base_s   base_sr     rubble and the contact shadow on the ground below
```

`top_t`, `top_c`, `lip_b`, `face_f` and `base_s` each come in three variants (`face_f`, `face_f2`, `face_f3`),
because those are the parts that repeat along a ledge. Pick among them at random and the wall won't show the same
stones every 16 px. The rock face tiles **tile vertically**, so stack as many `face_f` rows as the drop needs.

`top_tl` and `top_tr` are partial tiles — the plateau's edge wobbles, so part of the tile is transparent. Put those
on a layer above ordinary ground, not in the ground layer, or the gap renders as a hole.

## Props

Props are rendered with the characters' own renderer, camera and light — the same orthographic 3/4 view, the same
key light from the upper left, the same 7-step palettes — then drawn at the tileset's scale, so they sit in the same
world as the sprites rather than beside them.

A prop occupies a `w × h` block of tiles, stored contiguously in the atlas:

```json
{ "name": "tree_broadleaf_0", "first_tile": 186, "w": 3, "h": 3, "anchor_tile": [1, 2] }
```

Tile `first_tile + row * columns + col` is the prop's cell `(col, row)`. `anchor_tile` is the cell the prop stands
on — use it to sort the prop against characters by depth, and to decide which cells block movement. Trees are 2×3 or
3×3 tiles (32×48 or 48×48 px), boulders 2×1 or 2×2, bushes and stumps a single tile. The art is drawn so the base
sits a few pixels above the bottom of its block, which leaves room for a character to stand slightly in front of it.

Props have transparent backgrounds. Put them on a layer above the ground.

Detail tiles (`role: "detail"`) are also transparent and are meant to be scattered on that same layer: single-tile
tufts, pebbles, flowers, bones, sparkles, spores, depending on the biome.

## Rebuilding

```
cd generator
python3 make_tiles.py ..                     # all five biomes at 16x16
python3 make_tiles.py .. meadow wastelands   # or just some
python3 demo_map.py ..                       # the demo maps
python3 qa_tiles.py ..                       # structural checks -> docs/qa_tilesets.json

TILE_SIZE=64 python3 make_tiles.py ..        # the same sets at 64x64
```

`TILE_SIZE` is the one knob: everything is written in 64 px units and scaled from there, counts by area and lengths
by the side, with noise frequencies on the fourth root so a cluster stays a couple of pixels across at either size.

`tilepaint.py` holds the pixel-art painting (seamless ground textures, the blob mask, edge shading, the rock face),
`tileprops.py` builds the props out of the same primitives the characters use, and `make_tiles.py` has the
per-biome palettes, terrain lists and prop lists at the top — that's the file to edit to add a biome or change a
colour.

## Caveat: tile IDs move

The atlas is packed from scratch on every build, and props are placed by size, so **adding a terrain, a prop or a
variant renumbers tiles**. Maps painted against an older build will come out scrambled. That includes your existing
maps: these sets are new art with a new layout, so `meadow.json`, `barren_grasslands.json` and the rest will need
repainting against the new tileset rather than just swapping the PNG.

The sets here are stable as shipped. If you change a biome's definition and rebuild, either repaint the affected
maps or write a remap table from the old `tilesets.json` to the new one — the per-tile `role`/`terrain`/`code`/`prop`
fields are enough to match old IDs to new ones automatically.

## A note on scale

Your characters render at ~75 px tall in a 160 × 152 frame. Against 16 px tiles that is about 4.7 tiles, which is
very large for a top-down map — a tree here is 3 tiles tall, so a character would stand half again as tall as a
tree. If the map is drawn at 2× or 3× zoom and the characters at 1×, the two match up; if not, one of them needs to
move. `assets/tilesets_64/` holds the same sets at 64 × 64 for the case where the map scales up to meet the
characters instead.
