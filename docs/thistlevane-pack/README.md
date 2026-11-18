# Thistlevane — Character, Combat, Skill, VFX & Map Package · v2.2

v2.2 does two things: it reworks the body under every character, and it adds map tilesets.

> **If you are building a horde-survival game, you probably want v3 instead.** `thistlevane_v3.zip`
> has the same 18 classes with faster locomotion, a dash, upper-body fire overlays, and 26
> auto-firing weapons in place of the 270 MMO skills. v2.2 is the MMO build: aimed skills, cast
> clips that interrupt movement, one effect per skill. The two are independent — the tilesets here
> work with either.

* **Anatomy.** The figures had a bulging gut and rear, wide pelvises and no visible neck. The gut turned out to be
  `skirt()`, which was built as a capsule — a sphere swept along a line, so the radius that made it wide enough to
  be a coat tail also made it that deep front-to-back, and its spherical top cap rose over the waist. It is now a
  stack of flattened ellipsoids, as wide as the garment and only as deep as the body. Eleven of the eighteen
  classes used it. Alongside that: the
  skeleton now puts the crotch at ~52% of total height, the hips are compact and flat, the waist is pinched, the
  shoulder joint sits inboard of the deltoid so arms read as attached, and the head clears the chest. Standing poses
  were leaning the whole spine forward and carrying the head with it; the head is now counter-pitched so an idle
  reads as standing rather than hunching. Frame size and anchor are unchanged, so this is a drop-in replacement.
* **Maps.** Five **16×16** tilesets — meadow, barren grasslands, Thistlevane Hollow, Frostvane Peaks, wastelands —
  in the same 16-column, 256 px-wide atlas shape as the tileset already in your project. Seamless ground with six
  variants per terrain, 47-tile blob transitions exported as Tiled terrain brushes, shorelines with shallows, cliff
  sets and props rendered with the characters' own renderer and light. The same sets at 64×64 are in
  `assets/tilesets_64/`. See `docs/TILESETS.md`.

v2.1 made every skill's body animation and effect match its description (DESIGN.md §8.4). v2 was a full visual rebuild
of every class: the same 18 designs, the same clip names and the same 270 skills, redrawn at a larger size with more
detail, smoother motion and directional skill effects. See `docs/DESIGN.md` §8 for what changed and why.

Shipped as three zips that unzip into the same folder: `thistlevane_v2.2_core.zip` (everything except the effects) and
`thistlevane_v2.2_vfx_part1.zip` + `_part2.zip` (`assets/vfx/`, the 270 skill effect sheets, split by class).

Drop the folders into your project root:

```
assets/characters/<class>/animations/<class>_<clip>.png   one strip per clip: 8 rows (directions) × N frames, 160×152 each
assets/characters/<class>/animations/<class>.json         per clip: frames, durations, loop, strip, rects, hit/release events, attach points
assets/characters/<class>/sprites/<class>_locomotion.png  idle/walk/run/run_stop on one sheet (same frames as the strips)
assets/characters/<class>/sprites/<class>_portrait.png    idle frame facing south
assets/icons/skills/<class>/<skill>.png                    64×64 skill icons (270)
assets/vfx/<class>/<skill>.png                             one effect per skill, built from its description; 256×256 frames (aimed ones: 8 rows)
assets/vfx/manifest.json                                   per skill: sheet, frames, rows, directional, loop, timings, parts
assets/tilesets/<biome>.png + .tsj                         5 map tilesets, 16x16: ground, transitions, water, cliffs, props
assets/tilesets/tilesets.json                              the same data for engines that don't read Tiled files
assets/tilesets/demo_<biome>.png + .tmj                    a 40x26 map per biome, built from the set
assets/tilesets_64/                                        the identical sets at 64x64
data/skills/skills.json                                    270 skills; animation timings now match the real clips
data/classes, data/progression, data/balance               class table, unlock schedule, balance formulas
docs/DESIGN.md · docs/TILESETS.md · docs/TEST_REPORT.md · docs/qa_results.json
docs/skill_cards/<class>.jpg                               every active skill: name, description, clip, effect parts, and 3 stills of it in action
docs/INTEGRATION_PROMPT.md                                 prompt for wiring this into your engine with Claude Code
preview/roster.html                                        open in a browser: walk around and cast every skill
generator/                                                 everything that produces the above (Python 3.9+, numpy, Pillow)
```

| Property | value |
|---|---|
| Character frame | 160 × 152, anchor (80, 126) = the feet |
| Map tile | 16 × 16, atlas 16 columns (256 px wide), no margin or spacing |
| Character height | ~75 px (was ~49 px) |
| Row order in every strip | s, sw, w, nw, n, ne, e, se |
| Rects | relative to each clip's own strip (`animations.<clip>.image`) |
| VFX frame | 256 × 256, anchor (128, 178) = the caster's feet: put it on the character's anchor |
| VFX rows | 8 (one per facing) for aimed effects (slashes, projectiles, beams, dashes, walls, targeted fields); 1 for self-centred ones |
| Skill sync | spawn the skill's VFX at `skills.json → animation.activate_ms` (= the clip's `events.release_ms`) |

Rebuild everything:

```
cd generator
python3 build_all.py ..        # characters: locomotion + combat (about an hour on 2 cores)
python3 attach.py ..           # attachment points
python3 skills.py ..           # skills.json (timings read from the clips)
python3 make_icons.py ..       # icons
python3 make_vfx.py ..         # VFX library
python3 export_data.py ..      # data tables + preview page
python3 qa_classes.py ..       # automated QA → docs/qa_results.json
python3 make_tiles.py ..       # the 5 map tilesets (16x16; TILE_SIZE=64 for the large set)
python3 demo_map.py ..         # a demo map per biome
python3 qa_tiles.py ..         # tileset QA → docs/qa_tilesets.json
```
