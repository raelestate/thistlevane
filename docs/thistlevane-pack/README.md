# Thistlevane — Character, Combat, Skill & VFX Package · v2.1

v2.1: every skill's body animation and effect now match its description (DESIGN.md §8.4). v2 was a full visual rebuild of every class. It uses the same 18 designs, the same clip names and the same 270 skills,
redrawn at a larger size with more detail, smoother motion and directional skill effects. See `docs/DESIGN.md` §8 for
what changed and why.

Shipped as three zips that unzip into the same folder: `thistlevane_v2.1_core.zip` (everything except the effects) and
`thistlevane_v2.1_vfx_part1.zip` + `_part2.zip` (`assets/vfx/`, the 270 skill effect sheets, split by class).

Drop the folders into your project root:

```
assets/characters/<class>/animations/<class>_<clip>.png   one strip per clip: 8 rows (directions) × N frames, 160×152 each
assets/characters/<class>/animations/<class>.json         per clip: frames, durations, loop, strip, rects, hit/release events, attach points
assets/characters/<class>/sprites/<class>_locomotion.png  idle/walk/run/run_stop on one sheet (same frames as the strips)
assets/characters/<class>/sprites/<class>_portrait.png    idle frame facing south
assets/icons/skills/<class>/<skill>.png                    64×64 skill icons (270)
assets/vfx/<class>/<skill>.png                             one effect per skill, built from its description; 256×256 frames (aimed ones: 8 rows)
assets/vfx/manifest.json                                   per skill: sheet, frames, rows, directional, loop, timings, parts
data/skills/skills.json                                    270 skills; animation timings now match the real clips
data/classes, data/progression, data/balance               class table, unlock schedule, balance formulas
docs/DESIGN.md · docs/TEST_REPORT.md · docs/qa_results.json
docs/skill_cards/<class>.jpg                               every active skill: name, description, clip, effect parts, and 3 stills of it in action
docs/INTEGRATION_PROMPT.md                                 prompt for wiring this into your engine with Claude Code
preview/roster.html                                        open in a browser: walk around and cast every skill
generator/                                                 everything that produces the above (Python 3.9+, numpy, Pillow)
```

| Property | v2 value |
|---|---|
| Character frame | 160 × 152, anchor (80, 126) = the feet |
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
```
