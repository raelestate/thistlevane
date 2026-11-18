# Thistlevane — Character, Animation & Class System Design

v2 · 18 classes · locomotion, combat, 270 skills, icons and directional VFX in 8 directions

---

## 1. Project audit (Milestone 1)

The Thistlevane source project was not available to this session, so no code, assets or animation implementation could be inspected. You chose to integrate the delivery yourself, so everything here is **engine-agnostic**:

- Sprites are plain PNG sheets with transparent backgrounds and a fixed frame grid.
- Every frame rectangle, duration, loop flag, anchor and attachment point is listed in JSON, so no engine needs to compute them.
- Direction ordering is explicit and documented (section 3.2). If your engine only supports 4 directions, use rows `s`, `w`, `n` and `e`, and ignore the diagonals. Nothing else in the data changes.
- Folder layout follows the structure from the brief (`assets/characters/<class>/…`, `data/…`).

**What needs your project before Milestone 7 (integration):** the engine or framework name, the current sprite loader (frame size, direction order, origin convention), the animation controller, and how skills are stored. Rename keys in the JSON to match your loader, or send me those files and I'll write the adapter.

**Common causes of "mediocre" MMORPG animation that this system avoids:**

| Problem | Cause in typical projects | How Thistlevane avoids it |
|---|---|---|
| Foot sliding | Walk speed not tied to stride | Speeds are derived from stride and timing per class (`movement_speed_px_per_s`) |
| Stiff walking | 3–4 frame cycles, body only bobs | 8-frame IK gait with hip rotation, shoulder counter-swing and secondary motion |
| Run is just a fast walk | Same poses replayed faster | Separate run with a flight phase, forward lean, heel kick and pumping arms |
| Size jitter | Hand-redrawn frames drift | Every frame comes from one rig, so proportions are locked |
| Floating weapons | Weapons drawn on a separate layer with no attachment | Weapons are attached to the hand or forearm in 3D and follow the arm |
| Every class moves the same | Shared animation set | Shared clip *names*, but per-class posture, weight, stride, cadence and carry pose |
| Mirrored diagonals | West = flipped east | 8 directions rendered independently, so asymmetric gear stays on the correct side |

---

## 2. Art direction

**World tone.** Thistlevane is a weathered, living wilderness. Thistle-violet dusks, moss, bark and old iron, with a mysterious Hollow at its heart. Colour is earthy and muted across the cast. **Each class owns exactly one saturated identity colour**, so it can be recognised at 1× from across the screen:

- Monk: saffron
- Ironwarden: cobalt
- Ravager: rust
- Nightveil: violet-black
- Arcanist: royal blue and gold
- Ranger: forest green
- Necromancer: grave-green glow
- Dawnkeeper: ivory and gold
- Flintlock: oxblood coat
- Druid: leaf green
- Oathblade: indigo and lacquer red
- Minstrel: plum
- Thornlancer: olive and bronze
- Warlock: wine and violet glow
- Beastmaster: wolf grey and rust
- Briarwarden: bark and moss
- Vaneweaver: sky white
- Hollowstrider: ash with void violet

**Pixel rules (enforced by the pipeline and checked by QA):**

- Native frame 96×96. The character is about 49 px tall, around 5 heads, with eyes at mid-head. No chibi proportions.
- Binary alpha, with no anti-aliasing and no semi-transparent pixels.
- Every material is a 5-step ramp: outline, shadow, mid-shadow, base, light. Ramps are **hue-shifted**: shadows lean toward violet-blue and lights toward warm yellow. This is the classic hand-painted pixel look, and it ties every class to the world's thistle-dusk light.
- Light always comes from the upper-left of the screen, in every direction.
- Outlines are selective. The outer outline and inner depth-break lines use the darkest colour of the material they sit on, never pure black.
- An orphan-pixel clean-up keeps shading in deliberate clusters.
- Silhouette first. Every class has at least two silhouette hooks visible at 1×, for example the Ravager's mane, fur mantle and shoulder axe, or the Flintlock's wide-brim hat, coat tails and holstered pistols.

**Builds.** The cast uses five body builds: athletic, slim, heavy, feminine and feminine-athletic. All builds share the same height and rig, so any armour or equipment fits any class.

---

## 3. Animation specification

### 3.1 Frames

| Property | Value |
|---|---|
| Frame size | **160 × 152 px**, identical for every class and clip (v1: 96 × 96). The extra room above and to the sides fits raised staffs and the full spear reach |
| Anchor / origin | **(80, 126)**: ground point between the feet. Put this pixel on the entity position |
| Collision | footprint ellipse centred on the anchor, rx 13 px, ry 6 px (keep your existing collider and align it to the anchor) |
| Character height | about 75 px (heads and hats up to about 85 px) |
| Pixel density | 1.55 px per world unit (v1: 1.0) |
| Camera | orthographic 3/4 top-down, 25° elevation |
| Scaling | integer zoom with nearest-neighbour only |

### 3.2 Directions (row order inside every clip)

| Row | Id | Facing |
|---|---|---|
| 0 | s | toward camera |
| 1 | sw | down-left |
| 2 | w | left |
| 3 | nw | up-left |
| 4 | n | away |
| 5 | ne | up-right |
| 6 | e | right |
| 7 | se | down-right |

Engine order 1–8 from the brief (N, NE, E, SE, S, SW, W, NW) maps to rows 4, 5, 6, 7, 0, 1, 2, 3.

**Four-direction engines:** use rows 0, 2, 4 and 6. Diagonal movement then picks the nearest cardinal. The rows are already in the file, so upgrading to 8 directions later needs no new art.

### 3.3 Locomotion clips (v2)

| Clip | Frames | Loop | Timing | Notes |
|---|---|---|---|---|
| `idle` | 8 | yes | 190–230 ms | breathing (chest, shoulders a beat late), slow weight shift between the feet, head settles after the body |
| `walk` | 12 | yes | 78–96 ms (heavier classes are slower) | frame 0 = right heel strike; heel strike → roll → toe-off; body lowest after each strike, highest on the pass |
| `run` | 10 | yes | 60–72 ms | real flight phase; heel kicks up behind, knee drives forward, arms pump bent at the elbow |
| `run_stop` | 6 | no | 60–140 ms | plant, skid with the body thrown back, overshoot forward, settle into the class idle |

**Diagonal walking and running** are the `sw`, `nw`, `ne` and `se` rows of `walk` and `run`. They are true renders, not blends.

**Turning:** step through the neighbouring directions using frame 0 of the current clip, 45 ms per step, taking the shorter way around.

**Transitions:**

| From → to | Rule |
|---|---|
| idle → walk or run | start at frame 0 |
| walk ↔ run | keep the normalised phase (`frame / frames`), so legs never pop |
| run → idle | play `run_stop` |
| any → hurt | interrupt immediately |
| hurt → previous | resume the previous loop at frame 0 |

### 3.4 Combat clips (shared names for every class)

`ready`, `attack_1`, `attack_2`, `attack_heavy`, `cast_channel`, `cast_release`, `cast_ground`, `buff`, `guard`, `dash`, `ultimate`, `hurt`, `knockback`, `death`.

Each class also gets 1–3 **signature clips** (section 4). Every skill references a clip plus its timing events: `activate`, `hit` / `heal` / `release`, and `recover`. This means 270 skills do not need 270 bespoke animations. It is standard MMORPG practice, and it is also what keeps combat readable.

### 3.5 Attachment points

`animations/<class>.json → animations.<clip>.attach.<dir>[frame]` (frame pixels of the 160 × 152 frame) gives `hand_r`, `hand_l`, `head_top`, `chest`, `foot_l` and `foot_r` as `[x, y, depth]` in frame pixels. Use them to spawn projectiles at the hand, place nameplates at `head_top`, and spawn footstep dust at the feet. When drawing a VFX in front of or behind the body, compare its `depth` against `chest`.

### 3.6 Per-class movement character

Movement is driven by each class's `style.weight` (0 = light, 1 = heavy) and its posture.

| Effect of weight | Light (0) | Heavy (1) |
|---|---|---|
| Walk half-stride | 6.4 units | 5.4 units |
| Pelvis bob | 0.75 units | 1.3 units |
| Hip rotation | low | +50 % |
| Shoulder counter-swing | full | reduced |
| Run stance | 34 % ground contact | 42 % ground contact |
| Run heel kick | high | low |
| Run lean | 15° | 12° |

Arms holding a weapon (staff, spear, shoulder axe, shield, greatshield, grimoire) use a held carry pose with weighted bob instead of a free swing. Hands holding a free weapon (sword, daggers, bow) swing at roughly half amplitude so the blade doesn't poke forward.

---

## 4. The 18 classes

| # | Class | Role | Build | Silhouette hooks | Weapon carry | Idle posture | Signature clips (M4) |
|---|---|---|---|---|---|---|---|
| 01 | **Monk** | Support | athletic | bald with saffron forehead marks, saffron gi, crimson sash, wooden bead necklace, wrapped hands and shins | bead-crowned staff, upright | balanced; one hand raised in prayer | `palm_combo` (fast strikes), `meditate` |
| 02 | **Ironwarden** | Tank | heavy | full helm with cobalt crest, double pauldrons, cobalt tabard, greaves | sword low, round shield forward on the forearm | guarded; knees bent, shield up | `shield_bash`, `brace` (planted block) |
| 03 | **Ravager** | Melee DPS | heavy | wild rust mane and beard, fur mantle, bare chest with cross straps, war paint | great axe resting on the shoulder | aggressive; hunched, fist clenched | `whirlwind`, `roar` |
| 04 | **Nightveil** | Burst DPS | feminine | deep hood, face mask with only pale eyes showing, dark leather, back cloth tail | two daggers in reverse grip | low crouch, daggers ready | `vanish` (stealth), `backstab` |
| 05 | **Arcanist** | Magic DPS | slim | long silver hair and beard, royal-blue robe with gold bell cuffs, high collar, long gold stole | crystal-orb staff | scholar; free hand behind back | `elemental_channel`, `blink` |
| 06 | **Ranger** | Ranged DPS | feminine-athletic | auburn braid, green cloak, quiver on back, one leather pauldron | longbow in the left hand | alert; weight on one hip | `aim_draw`, `volley`, `trap_kneel` |
| 07 | **Necromancer** | Summoner | slim | black-violet hood, ash skin with green eyes, bone pauldron and necklace, skull at belt | bone staff with a green gem | hunched; claw hand forward | `summon_raise`, `curse` |
| 08 | **Dawnkeeper** | Tank / Support | feminine-athletic | golden bun, ivory and gold plate, crimson cape, ivory tabard | holy sword and ivory shield | guarded | `shield_block`, `holy_raise` |
| 09 | **Flintlock** | Ranged DPS | athletic | wide-brim hat with feather, oxblood long coat with tails, crossed bandoliers, beard | twin pistols holstered on the thighs | swagger; hands on hips | `quickdraw`, `reload`, `fan_fire` |
| 10 | **Druid** | Nature Support | feminine | leaf crown with antlers, moss robe, leaf mantle, vine wraps | branch staff with a living gem | serene; open palm | `root_summon`, `bloom` |
| 11 | **Oathblade** | Melee DPS | athletic | black topknot, indigo layered kimono over white, grey hakama, red sash, red lacquer pauldron | katana sheathed at the left hip, hilt forward | poised; hand on the scabbard | `iai_draw`, `counter_stance` |
| 12 | **Minstrel** | Support | feminine-athletic | chestnut hair with full fringe, plum doublet with gold puffed sleeves, teal half-cape | lute on back | jaunty; hip cocked, hand on strap | `play_lute`, `perform` |
| 13 | **Thornlancer** | Melee DPS | athletic | sandy crop, olive lamellar, double bronze-trimmed pauldrons, long red scarf | long spear upright, leaf blade with red tassel | alert | `spear_charge`, `sweep` |
| 14 | **Warlock** | Dark Magic DPS | feminine | long black hair over one eye, wine robe with long back panel, glowing violet face sigils | grimoire held at the hip | sinister; clawed hand raised | `book_open`, `hex` |
| 15 | **Beastmaster** | Summoner / Support | athletic | wolf-pelt hood with ears, fur cape, bone-tooth necklace, rust war sash, face stripes, brass whistle | twin blades crossed on back | prowl; loose arms | `whistle`, `command` (+ wolf companion) |
| 16 | **Briarwarden** | Defensive Tank | heavy | bark helm with moss crest, massive bark pauldrons with thorns, moss flaps | thorn-covered bark greatshield in front | planted; widest stance | `shield_plant`, `thorn_burst` |
| 17 | **Vaneweaver** | Magic / Support | feminine | white hair always lifting in the wind, sky-blue robe with wide white sleeves, feather charms | wind-chime staff (chimes swing) | floating; arms out, hair and cloth drift | `gale_spin`, `storm_call` |
| 18 | **Hollowstrider** | Magic / Melee DPS | athletic | ash-white wild hair, ash skin, void-violet sigils, corrupted left arm with void growths, ragged half-cape | twin void-edged blades in hand | twisted; asymmetric tilt, hanging corrupted arm | `void_step`, `eruption` |

---

## 5. Skill progression & balance framework (for Milestone 5)

### 5.1 Unlock schedule (identical for every class, no duplicate levels)

| Bracket | Exact unlock levels | Purpose |
|---|---|---|
| 1–5 | **1, 3** | foundation: basic attack skill + core identity tool |
| 5–10 | **6, 9** | first combination (builder → spender, or setup → payoff) |
| 10–15 | **11, 14** | signature mechanic |
| 15–30 | **18, 25** | utility and expansion |
| 30–50 | **34, 45** | advanced technique + strong defensive |
| 50–70 | **55, 65** | mastery: timing-reward skills |
| 70–100 | **75, 88, 100** | milestones: major active (75), capstone passive (88), **ultimate (100)** |

No level sits on a bracket boundary (5, 10, 15, 30, 50, 70), so no unlock is ambiguous.

### 5.2 Category mix per class (15 skills)

8 active, 4 passive, 2 utility or defensive, 1 ultimate. Class identity may shift one slot. For example, a summoner may trade an active for a summon, or a tank may trade an active for a defensive. The total is always 15.

### 5.3 Stats

| Stat | Formula |
|---|---|
| Base attack and magic attack | `ATK(L) = 20 + 4·L` (role modifiers apply) |
| HP | `HP(L) = (180 + 22·L) × role_hp`. Tank 1.6, melee 1.15, hybrid 1.0, ranged and magic 0.85, support 0.95 |
| Defence mitigation | `dmg_taken = raw × 100 / (100 + DEF)` |
| Critical | base 5 %, ×1.5 damage |

### 5.4 Skill power budget

```
damage = (ATK × M) × mitigation × (crit ? 1.5 : 1)
M_budget(cooldown, cast) = 0.9 + 0.30 × cooldown^0.8 + 0.25 × cast_time
```

| Modifier | Effect on M |
|---|---|
| AoE | × (1 / (1 + 0.35 × (targets − 1))) per target, cap 6 targets |
| Damage over time | total = 1.15 × budget, spread over duration |
| Hard CC | −0.35 per second (stun, root, sleep) |
| Soft CC | −0.12 per second (slow, silence) |
| Mobility or iframes | −0.25 |
| Role damage share | DPS 1.0, hybrid 0.8, tank and support 0.55. The remainder goes to utility: shields, taunts, buffs, heals |
| Healing | heal = MATK × M_heal, with M_heal = 0.85 × M_budget. Healing per second of a full support is about 0.8 × the DPS of a DPS class |
| Ultimate | cooldown 90–180 s, M ≈ 8–12, never more than 20 % of a 2-minute rotation's damage |

### 5.5 Resources (each class's own)

| Class | Resource | Behaviour |
|---|---|---|
| Monk | Ki | max 100; +8/s; healing strikes refund Ki |
| Ironwarden | Resolve | built by blocking and taking hits; spent on defensive techniques |
| Ravager | Rage | 0–100; built by dealing and taking damage; decays out of combat; damage rises with rage |
| Nightveil | Energy + Combo points | energy 100, +12/s; 5 combo points |
| Arcanist | Mana + Attunement | Fire, Ice or Storm attunement changes the follow-up effects |
| Ranger | Focus | +10/s; standing still regenerates faster |
| Necromancer | Mana + Essence | essence collected from deaths powers summons |
| Dawnkeeper | Faith | built by blocking and healing; spent on smites and auras |
| Flintlock | Powder (6 chambers) | shots consume chambers; reload is a skill; empty chambers enable a "last shot" bonus |
| Druid | Sap | regenerates faster on nature ground; heals over time stack |
| Oathblade | Spirit + Stance | counters generate Spirit; iai skills spend it |
| Minstrel | Tempo | casting on beat (rhythm window) builds Tempo; songs persist while Tempo is maintained |
| Thornlancer | Momentum | built by moving and charging; thrust damage scales with momentum |
| Warlock | Mana + Soul Shards | DoT ticks can grant shards; shards empower hexes |
| Beastmaster | Focus + Bond | the companion's Bond grows with commands; high Bond unlocks pet ultimates |
| Briarwarden | Sap (Bark) | taking damage grows bark stacks (armour); skills spend stacks for thorns and roots |
| Vaneweaver | Mana + Gale charges | 3 charges; wind skills consume or refund them |
| Hollowstrider | Corruption | 0–100; skills raise it; higher corruption means more damage but also self-damage; void step vents it |

**Resource cost formula:** `cost ≈ pool × (0.04 + 0.012 × cooldown)`. Builder skills have zero or negative cost.

### 5.6 Crowd control rules

Diminishing returns go 100 % → 50 % → 25 % → immune for 15 s. Bosses are immune to hard CC but take 50 % of slows. Taunts last 3 s and are capped by diminishing returns.

### 5.7 Skill data schema (applied to all 270 in Milestone 5)

```json
{
  "id": "monk_spirit_palm", "class": "monk", "name": "Spirit Palm",
  "level_required": 1, "category": "active", "tags": ["melee","spirit"],
  "target": "single_enemy", "range": 1.5, "radius": 0,
  "cooldown": 3.0, "resource": "ki", "resource_cost": 0, "resource_gain": 12,
  "cast_time": 0, "channel": 0,
  "effect": {"damage_type": "spirit", "multiplier": 1.25, "scaling": "atk", "heal_ally_pct": 0},
  "status": [],
  "animation": {"clip": "attack_1", "activate_ms": 80, "hit_ms": 160, "recover_ms": 320},
  "vfx": "monk/spirit_impact", "sfx": ["sfx_palm_whoosh","sfx_spirit_thump"],
  "scaling_per_level": "ATK(L)", "synergies": ["monk_inner_serenity"],
  "description": "…", "icon": "monk/spirit_palm.png"
}
```

A validator script (Milestone 5) will check:

- exactly 15 skills per class
- unique IDs
- unlock levels inside their brackets and not repeated
- categories match the 8 / 4 / 2 / 1 mix
- every animation clip exists in the class JSON
- every VFX and icon file exists
- damage multipliers fall within ±15 % of the budget formula

---

## 6. Milestone plan

| Milestone | Scope | Status |
|---|---|---|
| 1 | Project audit | done (no source access; engine-agnostic) |
| 2 | Art direction + 18 base characters | done |
| 3 | Locomotion overhaul: idle, walk, run, run_stop, diagonals, turning and transition rules, preview | done |
| 4 | Combat clips (14 shared + signature clips per class), hurt, knockback, death | done |
| 5 | 270-skill database + validator + balance sheet | done |
| 6 | Skill icons (270) + VFX library + clip and VFX references | done |
| 7 | Integration with your engine (needs the project files) | blocked on your upload |
| 8 | Full QA pass + test report update | partial (M1–6 and the v2 rebuild covered; final pass after M7) |
| v2 | Visual overhaul of every class, animation and effect (§8) | done |
| v2.1 | Every skill's animation and effect matched to its description (§8.4) | done |

Milestone 4 shipped 8,480 combat frames (16–17 clips × 18 classes × 8 directions):
the 14 shared clips plus each class's 1–3 named signature clips, all built from the
same shared rig as locomotion, with a new weapon-archetype layer driving how each
class's attacks actually move. Milestone 5 shipped all 270 skills (18 × 15) against
the published 17-field schema, with 0 validator issues. Milestone 6 shipped 270
skill icons and the VFX library described below. All three are covered in the
updated `docs/TEST_REPORT.md`.

## 7. Milestone 6 — skill icons & VFX library (delivered)

**Skill icons.** Every one of the 270 skills has its own 64×64 icon at
`assets/icons/skills/<class>/<slug>.png`, matching each skill's own `icon`
field exactly. Icons are pixel art like the rest of the game — binary alpha,
nearest-neighbour upscaled from a 16×16 logical grid — with a dark plate, a
1px border coloured by the skill's category (active/passive/utility/ultimate,
the same read as a quick-bar border in most RPGs), and a glyph tinted with
the class's own fx colour (the same `mats.fx.ramp` Milestone 4's combat
particles already use). The glyph shown is not arbitrary per skill — it's the
glyph for the skill's own VFX archetype (next), so an icon always matches
what actually plays when that skill is cast.

**VFX library.** Rather than one bespoke effect per skill (270 of them),
every skill routes through one of 13 reusable archetypes
(`generator/vfx.py`'s `ARCHETYPES`): `melee_impact, ranged_impact,
arcane_bolt, aoe_burst, release_burst, dash_trail, guard_shield,
ultimate_nova, heal_sparkle, summon_circle, buff_aura, passive_aura,
channel_pulse`. Which archetype a skill gets is decided by what the skill's
clip actually is: a basic attack clip maps to the class's own melee/ranged/
arcane weapon archetype; the five shared non-attack clips (`cast_ground,
cast_release, dash, guard, ultimate`) map directly to their matching
archetype; and each class's own named signature clips (`vanish`, `rapidfire`,
etc. — 38 in total) are mapped individually in `vfx.SIGNATURE_OVERRIDE`,
keyed by reading what that slot's skill actually does, not by the clip's own
name (see the transparency note below). Each class renders only the
archetypes its own 15 skills actually use (7–9 of the 13 per class, 140
sprite sheets in total), tinted with that class's fx ramp, at
`assets/vfx/<class>/<archetype>.png`, alongside `assets/vfx/manifest.json`.
v2 changed the format; see §8.2.

VFX frames are deliberately soft, additively-glowing, true particle-physics
animations (position, velocity, gravity, fade and scale simulated per
particle, supersampled 4× and box-filtered down for smooth glow edges) —
**not** binary-alpha pixel art like the character sprites and icons. This is
intentional, not an inconsistency: cast/impact effects in pixel-art games are
almost always rendered as soft glowing particles over hard-edged pixel-art
characters, and that contrast is what makes a cast read as alive rather than
pasted-on. Three archetypes (`passive_aura`, `channel_pulse`, `buff_aura`)
are built to loop seamlessly, for effects that hold for as long as a status
is active rather than playing once.

**Transparency note on clip naming.** A number of classes' signature clips
were named before their final skill names and flavour text were locked in
during Milestone 5 (e.g. nightveil's `"vanish"` clip slot is actually the
animation for "Backstab", not "Vanish" — a pre-existing naming artifact from
early development, not something corrected in the skill data itself, since
the clip *animations* are unaffected and renaming them now would be a
cosmetic-only change with no gameplay effect). Rather than trust each clip's
own name, every one of those 38 signature-clip slots across all 18 classes
was individually audited against the skill text actually assigned to it
(`SIGNATURE_OVERRIDE` in `vfx.py`, each entry commented with the real skill
name and why), so the VFX that plays always matches what the skill actually
does — the same audit discipline Milestone 5 used for `TARGET_OVERRIDE`.

---

## 8. v2 — visual overhaul

Feedback on v1 was that the characters, movement, attacks and skill effects all looked plain, stiff and choppy, and that
skill effects ignored the caster's facing. v2 rebuilds every asset from the same 18 designs, the same rig and the same
data. Clip names, skill ids and the JSON layout are kept wherever possible, so anything written against v1 needs only
the format changes listed in §8.3.

### 8.1 Characters

| | v1 | v2 |
|---|---|---|
| Frame / figure height | 96 × 96 / ~49 px | 160 × 152 / ~75 px |
| Shading | 4 tones per material | 6 tones per material (deep shadow → highlight), hue-shifted |
| Lighting | key light | key light + rim light on the shadow side + contact shadows where parts overlap (under arms, chin, cloak folds) |
| Metal | 4 bands | 6 bands with a dark horizon-reflection band |
| Weapon swings | 1 px dotted trail | filled crescent smear frame, bright leading edge |
| idle / walk / run / run_stop | 4 / 8 / 8 / 4 frames | 8 / 12 / 10 / 6 frames |
| Combat clips | 2–7 key poses shown as-is | 6–25 frames per clip, in-betweened (`generator/tween.py`) |

How the combat in-betweening works (tween.py): every clip still starts as a few authored key poses, which are then
expanded into a real animation:
- **lead-in** frames ease from the class stance into the first key, so a clip starts where the character actually is
- **anticipation**: the pose before a strike is pushed further away from the strike and held
- **strike**: one fast eased smear frame into the hit, with the weapon's swept area drawn as a smear
- **impact**: the hit pose is held longer (hit-stop) and followed by an overshoot past it
- **settle**: frames ease back to the stance with the body leading and the weapon trailing
- held clips (`ready`, `guard`, `cast_channel`, `brace`...) loop with breathing in-betweens

Each combat clip's JSON now carries `events`: `release_frame` / `release_ms` (when the skill's effect should spawn)
and `hit_frame` / `hit_ms` (when the blow lands). `skills.json → animation.activate_ms / hit_ms / recover_ms` are now
read from these real clip timings instead of fixed placeholder values.

### 8.2 Skill VFX (`generator/vfx3d.py`)

v1 effects were flat 2D pictures centred in a 96 px box, identical for all facings, with particles re-randomised every
frame. v2 simulates each effect in the characters' own world space and projects it through the same 3/4 camera:

- **Directional** archetypes are rendered for all 8 facings (8 rows per sheet): `melee_impact` (crescent slash +
  impact flash + sparks), `ranged_impact` (shot, flight, impact), `arcane_bolt` (sigil charge, orb with orbiting motes,
  rune-ring detonation), `release_burst` (forward cone of wavefronts), `dash_trail` (afterimage ribbons, ghost
  silhouettes, kick-off dust), `guard_shield` (curved energy barrier in front with a ripple travelling up it).
- **Ground effects lie flat**: shockwaves, sigils, mandalas and scorch marks are ellipses on the ground plane, the way
  the ground looks from this camera.
- **Real particles**: each particle is created once per clip and simulated (velocity, gravity, drag, lifetime), and
  drawn as a motion-blurred streak, so sparks fly and fall instead of flickering.
- **Frames**: 256 × 256 with the anchor at (128, 178), the caster's foot point. Draw the frame so that pixel sits on the
  character's anchor and the effect lines up with the body and hands with no per-effect offsets.
- Colours are tone-mapped and un-premultiplied: normal alpha blending works, and additive blending reads brighter.

### 8.3 Format changes from v1

| What | v1 | v2 |
|---|---|---|
| Character frame | 96 × 96, anchor (48, 76) | 160 × 152, anchor (80, 126) |
| Combat sheet | one `<class>_combat.png` master sheet | removed: at the v2 frame size it would exceed the 16384 px texture limit. Use the per-clip strips |
| Rects | relative to the master sheet (`first_row`) | relative to each clip's own strip, `animations.<clip>.image`; row = direction index (× 152), x = frame × 160 |
| Clip timing | per-key | per-frame `durations_ms` + `total_ms` + `events` |
| VFX frame | 96 × 96, centred, 1 row | 256 × 256, anchor (128, 178); `rows` 8 for directional archetypes, else 1 |
| Skill timing | placeholders (80 / 160 / 280 ms) | from the real clip (`activate_ms` = release, `hit_ms`, `recover_ms` = clip length) |

### 8.4 v2.1: every skill's animation and effect match its description

Feedback on v2 was that skills didn't match their descriptions. An audit of all 270 found two causes:

1. **Shared effects.** Every skill used one of 13 generic effects in its class colour, so Frost Shard, Fire Lance and
   Spark Bolt all fired the same orb, and Plague Cloud, Thorned Ground and Consecration played the same shockwave.
2. **Off-by-one signature clips.** Skills got their body animation from their slot number, and in most classes the
   signature clips were assigned one skill out of place. Nightveil's Backstab played the vanish animation and Vanish
   played the backstab; Beastmaster's Whistle played a claw swipe and Command played the whistle; and so on.

v2.1 replaces both with a hand-written table (`generator/skillfx.py`). For each of the 198 non-passive skills it gives
the body clip that fits the text, and an effect assembled from parts (`generator/vfx_skills.py`) in the element the
text names:

| Part | What it draws |
|---|---|
| slash (h / rev / v / x / wide / low / draw) | crescent cuts, overheads, cross-cuts, wide arcs, low sweeps, iaido line cuts |
| thrust, claw, impact, flurry, spin | spear/dagger thrusts, claw marks, punches and bashes, rapid multi-hits, whirlwinds |
| proj (orb / arrow / bullet / shard / lance / bone / wind / note / skull) | element-specific projectiles with their own flight and impact |
| multi, pierce, chain, beam | volleys and fan fire, shots passing through, chain lightning, life-drain tethers |
| sky (meteor / pillar / bolt / arrows) | things that fall on the target |
| field (thorns / roots / cloud / rift / storm / cyclone / trap / glyph / quake / nova) | what grows, gathers or erupts on the ground at the target |
| dash, blink, wall, ward, aura, heal, shout, song, summon, mark, stance, reload, camo | movement, barriers, domes, power-ups, heals, roars, music, skeletons / wolves / trees, target marks… |

Elements: fire, ice, lightning, arcane, holy, shadow, void, nature, thorn, wind, poison, blood, sound, spirit, steel,
bone, smoke, earth, necro, rage, moon, wild. Each skill's `vfx_parts` in skills.json lists its parts, e.g.
Meteor = `sky:fire:meteor`, Drain Life = `beam:necro:drain`, Bone Wall = `wall:bone:bone`.

Six shared clips were added so the body matches the text too: `leap_strike` (leaping knee, pounce),
`throw` (bone spear, smoke bomb), `point_cast` (drain, curse, natural grasp, heal an ally), `flurry` (hundred hands,
thousand cuts, thousand spears), `battle_cry` (howl, battle hymn, alpha's call) and `kneel` (meditate, camouflage).

**VFX format v3**: one sheet per skill at `assets/vfx/<class>/<skill>.png` (the skill's `vfx` field), described in
`assets/vfx/manifest.json → skills.<skill_id>` (sheet, frames, rows, directional, loop, durations_ms, parts). Aimed
effects have 8 rows (facings in the character row order); self-centred ones have 1. Frames are 256 × 256 with the
anchor at (128, 178). Icons now take their colour from the skill's element and their glyph from its main effect part.
