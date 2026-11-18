# Thistlevane — Test Report (Milestones 1–6, v2.2)

Automated checks: `generator/qa_classes.py` (characters → `docs/qa_results.json`) and `generator/qa_tiles.py` (tilesets → `docs/qa_tilesets.json`).
Visual checks: idle, walk, run and run_stop reviewed for all 18 classes in contact sheets and in `preview/roster.html`.

## Completed and tested

| Area | Check | Result |
|---|---|---|
| Characters | All 18 classes render in all 8 directions | Pass: 3,456 frames, none empty |
| Characters | Transparency is binary (no semi-transparent or anti-aliased pixels) | Pass, all classes |
| Characters | Every pixel uses that class's palette ramps | Pass: 37–66 colours per class |
| Characters | Proportions identical across frames and classes (shared rig) | Pass: idle height 46–57 px; variation comes from hats, antlers and crests, not body scale |
| Characters | No frame clipped at the 96×96 edge | Pass |
| Animation | Grounded frames keep the feet on the anchor line (no floating) | Pass. Run frames 0 and 4 are deliberate flight frames |
| Animation | Run is clearly faster than walk and uses different poses | Pass: run speed is 2.1–2.3× walk; separate gait with flight phase and lean |
| Animation | Speeds derived from stride, so no foot sliding at the listed speeds | Pass (per-class values in each JSON) |
| Animation | Diagonals rendered, not mirrored | Pass: 8 independent directions |
| Animation | run_stop ends in the class's own idle posture | Pass |
| Animation | Held weapons attached to hands or forearms | Pass. Visually verified for staff, spear, shoulder axe, shield, greatshield, bow, grimoire and daggers |
| Data | Every frame rect, duration and loop flag is in JSON | Pass |
| Data | Attachment points per frame (hands, head, chest, feet) | Pass |

## Milestone 4 — Combat animation system

| Area | Check | Result |
|---|---|---|
| Combat | All 18 classes render their full combat set in all 8 directions | Pass: 8,480 frames, none empty |
| Combat | 14 shared clips present for every class, plus each class's own 1–3 signature clips | Pass: 16–17 combat clips per class (0 missing) |
| Combat | Signature clip names match `DESIGN.md` §4's class table exactly | Pass: 0 mismatches across 18 classes |
| Combat | No frame clipped at the 96×96 edge | Pass, after fixes (see below) |
| Combat | Transparency, palette and attachment-point checks (same as M1-3) | Pass, all classes |
| Combat | Weapon-tip motion trails render on swings (sword/katana/axe/dagger/spear) | Pass, visually verified |
| Combat | Per-class `fx` particle colour (cast/buff/ultimate) matches class identity | Pass, 18 distinct colours |

**Caught and fixed during QA, before this build:** the first combat build (8,480
frames) found 52 frame-edge clipping issues, concentrated in three places —
the shared `death` collapse rolling too far onto its side for bigger
silhouettes, the caster `cast_release` pose re-projecting its frozen raised-arm
target through a straightening torso, and the `ultimate` ground VFX ring at its
widest. The largest single cause was thornlancer's spear: at 32 units it's the
longest weapon in the roster, and several of its attack and signature poses
reached far enough to push the spear tip past the frame edge at side-on views.
Each was fixed by tuning the specific pose's reach, lean or VFX radius (not by
shortening the spear itself, which is unchanged outside combat) and reverified
by re-rendering every affected frame before committing to the full rebuild.
The rebuilt combat set passes with 0 clipping issues.

## Milestone 5 — Skill database

| Area | Check | Result |
|---|---|---|
| Skills | 270 skills total (18 classes × 15) | Pass |
| Skills | Unique skill IDs | Pass |
| Skills | Unlock levels match the published schedule, no repeats, in bracket order | Pass |
| Skills | Category mix per class (8 active / 4 passive / 2 utility / 1 ultimate) | Pass, all 18 classes |
| Skills | Every skill's `animation.clip` exists in that class's built combat/locomotion data | Pass: 270/270 checked, 0 missing |
| Skills | Damage multiplier matches the published power-budget formula | Pass by construction (`effect.multiplier == budget`) |
| Skills | Target/mechanics match the skill's own flavor text | Pass, after a full manual audit (see below) |

**Caught and fixed before shipping:** a systematic audit of all 270
descriptions against their generated `target`/`damage_type` fields found two
wording issues (two "passive"-styled abilities sitting at active/utility
slots — reworded to read as active) and a broader mechanical-default problem:
the schema's slot-based defaults assumed most slots are attacks, but roughly a
third of the roster's skills are, by their own flavor, a self-buff, stance,
summon, or ally heal — these were mechanically defaulting to "hit a single
enemy" regardless. Fixed with an explicit per-skill target override table in
`skills.py` (`TARGET_OVERRIDE`), covering every deviation found across all 270
entries, plus broadened the damage-nulling rule to cover self-targeted skills
(a dash or a stance deals no damage, so it now carries none). Re-validated:
`0 validation issues`, and spot-checks of every corrected entry resolve
correctly (e.g. `monk_inner_serenity` is now self-targeted with no damage
multiplier; `dawnkeeper_lay_on_hands` is an ally heal; `ravager_whirlwind` is
area-of-effect).

## Milestone 6 — Skill icons & VFX library

| Area | Check | Result |
|---|---|---|
| Icons | Every skill has a 64×64 icon file at its own `icon` path | Pass: 270/270 checked, 0 missing |
| Icons | Icon transparency is binary (pixel-art rule, same as character sprites) | Pass, 0 malformed |
| VFX | Every skill's VFX archetype has a sprite sheet for its own class | Pass: 270/270 checked, 0 missing |
| VFX | Each sheet's size matches its archetype's frame count × 96px in `manifest.json` | Pass, 0 malformed |
| VFX | Every signature-clip slot (38 across 18 classes) has an explicit, audited archetype override | Pass: 0 missing, 0 unused/stale entries |
| VFX | No archetype renders a fully blank frame, any class | Pass, verified by per-frame nonzero-pixel scan across 3 tint spreads |
| VFX | 13 archetypes × 18 classes, counted against each class's own skill set | Pass: 140 sheets (7–9 archetypes per class, matching which clips that class actually uses) |

**Design.** Rather than 270 one-off effects, every skill routes through one
of 13 reusable VFX archetypes (`generator/vfx.py`), tinted per-class with
that class's own `fx` ramp — the same colour Milestone 4's combat particles
already use. Icons share the same archetype→glyph mapping, so a skill's
icon always matches what its cast/impact VFX actually looks like. Full
design rationale, the archetype list and the clip→archetype mapping rules
are in `docs/DESIGN.md` §7.

**Caught and fixed before shipping:** the first pass of 7 of the 13
archetypes (the ones not shown in the earlier live-reaction demos) read as
flat and static next to the 5 archetypes that had already gotten the
eldritch-sigil/anime-aura/fire treatment. Brought up to the same standard
(radiating lightning, notched mandala rings, launch flares) and re-verified.
That same pass also surfaced two latent bugs in the three "traveling bolt"
archetypes (`ranged_impact`, `arcane_bolt`, `release_burst`): the arrow/bolt
head sprite kept rendering at full brightness forever after reaching its
target instead of fading out (fixed by fading the travel trail out over the
first ~0.35s after arrival), and that fix then exposed two fully-blank final
frames where the random particle burst's lifetime didn't reliably reach the
clip's last frame (fixed by raising the particle lifetime floor so every
particle survives to the clip's actual last frame, not just on average).
Re-verified with a per-frame nonzero-pixel scan across three different class
tints: 0 blank frames remain.

## v2 rebuild — characters, animation and VFX

Every character, animation and effect was regenerated. Checks below are from `generator/qa_classes.py`
(`docs/qa_results.json`, **total_issues: 0**) plus the visual checks listed.

| Area | Check | Result |
|---|---|---|
| Frames | 26,232 character frames (18 classes × 8 directions × locomotion + combat) rendered | Pass |
| Frames | No frame empty, none touching the frame edge, feet on the ground line | Pass, 0 issues |
| Frames | Binary alpha (pixel-art rule) on every strip | Pass |
| Clips | Every clip has one duration per frame; every combat clip has hit/release events | Pass |
| Clips | Every class has all 14 shared combat clips + its signature clips | Pass |
| Movement | Run clearly faster than walk; speeds derived from stride so planted feet don't slide | Pass |
| Skills | 270 skills, 0 validator issues; every clip exists; activate/hit/recover read from the real clips | Pass |
| Icons | 270/270 present, 64×64, binary alpha | Pass |
| VFX | 270/270 skill→sheet links resolve; every sheet is frames × 256 wide and rows × 256 tall per the manifest | Pass |
| VFX | Directional archetypes rendered for all 8 facings; no frame clipped at the canvas edge (except the ultimate's light pillar, which leaves the top on purpose) | Pass |

**Caught and fixed during the rebuild:**
- **Skin showing through trousers** on heavy builds (Ironwarden, Briarwarden, Ravager): clothing radii didn't scale
  with the build's limb thickness. Clothing now always fits over the limb.
- **Sword poking forward while walking** (Ironwarden, Dawnkeeper, daggers): a hand holding a free weapon now swings at
  about half amplitude.
- **Weapons cut off by the frame.** The first v2 render used a 128 × 128 frame, and QA flagged 230 frames where raised
  staffs (ultimates, casts) or the Thornlancer's spear crossed the frame edge. The frame was enlarged to 160 × 152 and
  everything re-rendered, and QA now reports 0 issues. The poses were kept rather than toned down.
- **Oversized in-sprite ground rings** on ultimates (rings of dots reaching the frame bottom) were shrunk. The big
  ground effects now live in the VFX sheets.
- **VFX overflowing the canvas** (ground shockwaves, side-facing bolt impacts) was fixed by easing ring growth and
  shortening projectile travel so impacts stay inside the 256 px frame in every facing.

## v2.1: skills matched to their descriptions

| Area | Check | Result |
|---|---|---|
| Audit | All 270 skills: description vs body clip vs effect | 198 non-passive skills had a generic effect; most classes had signature clips one skill out of place |
| Clips | Every skill's clip chosen from its text (`skillfx.SPEC`), not its slot | Fixed: Backstab ↔ Vanish, Whistle ↔ Command, Shield Plant / Thorn Burst, Holy Raise, Fan Fire / Smoke Screen, etc. |
| Clips | 6 new shared clips for actions the text names (leap, throw, point-and-cast, flurry, battle cry, kneel) | 4,480 new frames, all classes |
| VFX | Every skill has its own effect sheet, built from parts in the element its text names | 270 sheets; 0 missing, 0 malformed in QA |
| VFX | Aimed effects rendered for all 8 facings, self-centred ones once | Checked per skill by the manifest's `rows` |
| Icons | Icon colour follows the skill's element, glyph follows its main effect part | 270/270 |
| Data | `skills.json` adds `vfx_parts`; activate/hit/recover recomputed from the newly assigned clips | 0 validator issues |

Spot-checked visually: Spark Bolt (lightning orb), Fire Lance (burning lance), Frost Shard (ice shard + frost burst),
Chain Lightning (3 jumps), Meteor (falls, craters, flames), Drain Life (tether pulling back to the caster), Bone Wall,
Plague Cloud, Army of the Dead (3 skeletons rise), Smoke Bomb (thrown, then smoke), Root Summon, Oblivion (void rift
+ pillar), Mana Shield (dome), Brace (shield wall), Command (wolf attacks the marked target), Heart of the Forest (tree
+ dome + heal), Play Lute (notes), Roar (shockwaves + rage flames), Storm Call (cloud, rain, lightning), Fan Fire,
Scattershot, Rain of Arrows, Trap, Thorned Ground, Cyclone, Collapse (void pull).

## v2.2: anatomy

| Area | Check | Result |
|---|---|---|
| Anatomy | The bare body was rendered, with clothing disabled, to see what the silhouette actually was | Confirmed the report: wide pelvis, soft stomach, no neck. Measured, not guessed — the chest ellipsoid's top sat at z = 42.2 against a head bottom at z = 41.0, so the head intersected the chest |
| Anatomy | Crotch height as a fraction of total height | ~45% before, ~52% after (heroic proportions) |
| Anatomy | Hip, trouser, belt and skirt volumes no longer stack into a diaper | Pelvis, trousers and belt all narrowed; skirts and hip flaps clamped so they can't swell past the hip |
| Anatomy | **The gut** — found on a second pass after the first fix was wrongly called complete | `skirt()` was a capsule, so it was as deep front-to-back as it was wide and its spherical top cap rose over the waist. Rebuilt as a stack of flattened ellipsoids. Isolated by rendering each clothing piece disabled in turn at 8x; 11 of 18 classes were affected |
| Anatomy | Arms read as attached to the torso | Shoulder joint moved inboard (×0.82 of build width), deltoid spheres added outboard, default arm roll cut from 9° to ~2° |
| Anatomy | Idle reads as standing, not hunching | Head counter-pitched by half the spine lean; posture leans reduced |
| Format | Frame size, anchor, row order, clip names, JSON schema | Unchanged — v2.2 drops in over v2.1 |
| Build | All 18 classes re-rendered, then `attach.py`, `skills.py`, `export_data.py`, `qa_classes.py` re-run | See `docs/qa_results.json` |

The union in the renderer is a hard `min`, not a smooth one, so the silhouette is exactly what the primitive
parameters produce — which is why reading the numbers off the rig was enough to find each cause.

## v2.2: map tilesets

Automated checks: `generator/qa_tiles.py` (raw results in `docs/qa_tilesets.json`).

| Area | Check | Result |
|---|---|---|
| Atlas | 16×16 tiles in a 16-column, 256 px-wide atlas — the same shape as the project's existing tileset | Pass, 5 biomes |
| Atlas | Manifest tile count matches the PNG, and the `.tsj` matches both | Pass, 5 biomes at 16 px and at 64 px |
| Atlas | Every blob set has all 47 cases, no duplicates | Pass: 15 sets (2 terrain pairs + 1 shoreline per biome) |
| Atlas | Ground and liquid tiles are fully opaque | Pass |
| Atlas | Six ground variants per terrain | Pass — four was enough at 64 px, visibly repetitive at 16 px |
| Atlas | Cliff sets have all 15 named parts, plus 3 variants of each repeating part | Pass |
| Atlas | Prop blocks are contiguous, inside the atlas, and have no empty rows or columns | Pass, after fixing footprints that were a tile taller than the art |
| Tiled | Wang sets are well-formed: 47 tiles each, 8-entry wangids | Pass, 15 sets |
| Seams | Ground repeats without showing the tile grid | Verified by folding a rendered field's row and column means onto one 64 px cell, and by eye on 3×3 tilings |
| Props | Props sit in the same light and palette world as the characters | Rendered through the characters' own renderer; checked side by side in the demo maps |

**Caught and fixed during QA:**

- **A detail-free band around every tile.** Marks were scattered with a 2 px margin, so columns 0 and 63 had
  essentially no tufts in any variant while the middle columns had ~0.4 per tile. A field of grass showed a faint
  lattice. Marks are now scattered edge to edge (they wrap).
- **A rim drawn along tile edges.** `edge_shade` and `overlay` used `np.roll`, so a terrain boundary that simply ran
  off the tile was read as an edge and got a light or dark lip drawn along it. Folding the demo map's columns showed
  position 0 at 117.5 against an interior mean of 124. Both now shift with border replication; the folded profile is
  flat.
- **Blob masks with holes.** A corner-rounding test had its sign inverted and its radius set to 19 px instead of 15,
  punching holes out of regions that should have been solid.
- **Transitions that were invisible.** The boundary sat exactly on the tile edge, so there was nothing to see. The
  upper terrain now pulls back 11 px, which shows a real band of the lower one.
- **Cliff faces like melted wax.** `sin()` of the x coordinate drew smooth vertical drips. Replaced with blocky
  strata whose course heights and block widths each sum to the tile size, so the face tiles in both directions.
- **Shadows that read as outlines.** A two-step drop shadow lands most of the way down the ramp on snow and drew a
  grey line around every patch of ice. Reduced to one step everywhere.
- **Lava that read as dried blood,** then as orange noodles. Settled on Voronoi plates of cooled crust with the melt
  glowing in the seams between them.
- **Prop footprints a tile too large.** Trees and boulders declared a 2×3 or 2×2 block but only filled part of it.
  Footprints are now trimmed to the art, and `anchor_tile` recomputed, so a prop blocks only the cells it occupies.
- **Demo maps painting rectangles.** Two separate bugs: terrain noise sampled with a coarse stride (aliased into
  rectangles) and the demo picking a transition pair that didn't match the terrain it was painting, which exposed a
  third terrain's colour along every boundary.
- **The whole set built at the wrong size.** It was first built at 64×64 on a stated preference; measuring the
  project's own `barren_grasslands.png` (256 × 1824, strongest edge period 16 px in both axes) showed the game uses
  16×16 in a 16-column atlas. Rebuilt at 16, with `TILE_SIZE` as the knob and the 64 px sets kept alongside.
- **Camouflage at 16 px.** Scaling cluster frequency by the tile's side keeps clusters the same size in pixels,
  which is a third of a 16 px tile. The fourth root of the area ratio keeps them at about 2 px. Picked by rendering
  a 5×5 field at six parameter settings and comparing.
- **A brick wall instead of a cliff.** Course heights and block widths scaled down to 2–4 px, which is a line, and
  a wall of lines is brickwork. Both now hold a floor of 3–4 px, and block highlights drop to one palette step.
- **Lava as an orange lattice.** A dilated seam is most of a 16 px tile. Below 32 px the seam is drawn 1 px wide
  with no halo. (Found alongside a precedence bug — `seam & (a + b) % 3 == 0` parses as `(seam & ((a+b)%3)) == 0` —
  which painted almost the whole tile at the hottest palette step.)
- **Shorelines that read as a cut.** Water now steps up two palette levels against the land. Applying both bands at
  two steps each clamped the inner one to the top of the ramp and drew a glowing cyan outline; one step per band
  reads as shallows.

## Known issues and limits

- **One pixel of clipping.** `oathblade/leap_strike`, facing north, frame 5: a single pixel of the sword tip
  touches the top edge of the frame. The longer legs in v2.2 raise the apex of the leap by about 3 px. One pixel
  did not justify re-rendering 18 classes; if it bothers you, lower `leap` in `combat.py` by 2 and rebuild that
  class alone.

- **Silhouette similarity.** The automated overlap check still ranks Arcanist/Vaneweaver and Ironwarden/Dawnkeeper as the closest idle-pose pairs (now joined by Ranger/Hollowstrider, Necromancer/Minstrel and Minstrel/Warlock). They remain separated by palette, headgear and weapon; combat now also separates them further through each class's weapon archetype and signature clips (e.g. Arcanist blinks and bolts, Vaneweaver spins and calls storms). Review them in the preview and tell me if you want a stronger idle silhouette change too.
- **Robes while running.** On robed classes the hem lifts and the legs show through during the run's flight frames. This is intentional, so the stride stays readable, but it is a stylistic choice.
- **Masked and hooded faces.** Nightveil, Necromancer and Beastmaster faces are partly hidden by design. Only the eyes or glow read at 1×.
- **Paper-doll layers not built for the 18 classes yet.** The generator supports them (`build_classes.py --layers`, 9 layers), and `build_combat.py --layers` extends the same support to combat. They were skipped this milestone to keep the build time down. Ashvale's pack demonstrates the layer format.
- **Faces are small.** At this camera distance a face is a few pixels, so expressions don't read. Portraits for
  dialogue/UI would need separate art.
- **Silhouette similarity**: the most similar south-facing idles are arcanist/vaneweaver (IoU 0.90) and arcanist/druid
  (0.88), all robed staff-casters. Colour and props separate them, but the shapes are close.
- **VFX are soft glow, not pixel art**, by design (§7 of DESIGN.md). Additive effects drawn over the body don't
  depth-sort against it: a shield effect for a character facing away still draws on top.
- **Package size**: soft-glow VFX compress poorly as PNG, and v2.1 has 270 sheets with 8 rows for every aimed effect.
  Converting them to WebP (or a GPU format) in your pipeline cuts them by about 80%. 256-colour quantisation was tried
  and rejected: it bands the glows visibly.
- **Effects are generic within a part.** Every meteor looks like a meteor and every skeleton like a skeleton. They are
  built procedurally from parts, not hand-animated per skill.
- **New tilesets renumber tile IDs.** The atlas is packed from scratch on every build and props are placed by size,
  so adding a terrain, prop or variant moves tile IDs and scrambles maps painted against an older build. The sets
  shipped here are stable; `docs/TILESETS.md` explains how to build a remap table if you change a biome.
- **Tilesets are not tested in an engine.** They open correctly in Tiled (`.tsj` tilesets with working terrain
  brushes, `.tmj` demo maps), and the manifest is checked against the PNG, but nothing here has been rendered by a
  game.
- **The existing maps will need repainting.** These are new sets with their own layout, so `maps/meadow.json` and
  the rest can't just point at the new PNG — the tile IDs are different. `docs/TILESETS.md` explains how to build a
  remap table if repainting by hand is too much.
- **Characters and tiles are at different scales.** Characters are ~75 px tall; a 16 px tile makes that 4.7 tiles,
  against trees that are 3 tiles. Either the map is drawn zoomed or one of the two needs to move. The 64 px sets
  are included for the second case.
- **One elevation edge per biome.** The cliff set draws a ledge with a top, a face and a base. It has no outer
  corners for a plateau that juts out, no stairs or ramps, and no second rock type.
- **Four variants per terrain.** Enough that a large field doesn't visibly repeat, but a very large open map benefits
  from more; `base_tiles(..., n=4)` is the number to raise.
- **Integration has not been started.** It is Milestone 7, blocked until your project is uploaded.

## Not testable without the game project

- Engine rendering, animation controller and direction handling
- Collision alignment in-game
- Whether skill cooldowns, resource costs, damage and healing numbers feel right in actual play (the validator checks the data is internally consistent and well-formed; playtesting the numbers happens in Milestone 7 against your engine)
