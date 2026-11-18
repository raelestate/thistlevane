# Prompt for integrating Thistlevane v2 with Claude Code

Paste everything below the line into Claude Code, opened in your game's repo. Replace `<PATH>` with the folder you
unzipped the package into.

---

I'm integrating a pre-built character, animation, skill and VFX package called "Thistlevane" (v2) into this game. It
was generated outside this codebase and covers an 18-class MMORPG roster: 8-direction locomotion and combat
animations, a 270-skill database, 270 skill icons and a directional VFX library. It is at: `<PATH>`

Read `<PATH>/README.md`, `<PATH>/docs/DESIGN.md` (especially §3 and §8) and `<PATH>/docs/TEST_REPORT.md` in full
first. Do not regenerate or edit anything under `assets/` or `data/`: it's a finished, QA'd deliverable. Only write
adapter/integration code on this project's side.

## Package formats (v2)

**Characters**: `assets/characters/<class>/animations/<class>.json` + one PNG strip per clip
(`<class>_<clip>.png`).
- Frame 160×152, anchor (80,126) = the feet. Place this pixel on the entity's world position.
- Every strip has 8 rows in the order `s, sw, w, nw, n, ne, e, se`, with frames left to right. Rects in the JSON are
  relative to that clip's own strip (`animations.<clip>.image`): x = frame × 160, y = direction index × 152.
- Per clip: `kind` (locomotion | combat), `frames`, `loop`, `durations_ms` (per frame), `total_ms`, `directions`
  (rects), `attach` (per direction, per frame: `hand_r`, `hand_l`, `head_top`, `chest`, `foot_l`, `foot_r` as
  [x, y, depth] in frame pixels).
- Combat clips also have `events`: `release_frame` / `release_ms` (spawn the skill's effect here) and `hit_frame` /
  `hit_ms` (apply damage here).
- `movement_speed_px_per_s` {walk, run} keeps the feet from sliding at the delivered frame timings.
- Clips: idle, walk, run, run_stop, ready, attack_1, attack_2, attack_heavy, cast_channel, cast_release, cast_ground,
  buff, guard, dash, ultimate, hurt, knockback, death, plus each class's `signature_clips`.
- A 4-direction engine can use rows s / w / n / e only.

**Skills**: `data/skills/skills.json`, 270 entries. Fields: id, class, name, level_required, category
(active | passive | utility | ultimate), tags, target, range, radius, cooldown, resource, resource_cost, resource_gain,
cast_time, channel, effect {damage_type, multiplier, scaling, heal_ally_pct}, status, animation {clip, activate_ms,
hit_ms, recover_ms}, vfx ("<class>/<skill>", the VFX sheet), vfx_parts (what the effect is made of, e.g. "sky:fire:meteor"), sfx (placeholder names, no audio included), scaling_per_level,
synergies, description, icon ("<class>/<slug>.png" under assets/icons/skills/).
`animation.activate_ms / hit_ms / recover_ms` match the clip's real events and length.

**VFX**: `assets/vfx/manifest.json` + one sheet per skill at `assets/vfx/<class>/<skill>.png` (the skill's `vfx`
field + `.png`).
- Frame 256×256, anchor (128,178) = the caster's feet: draw the VFX frame so its anchor sits on the character's
  anchor. No per-effect offsets are needed.
- `skills.<skill_id>`: sheet, frames, rows, directional, loop, durations_ms, parts. Directional (aimed) effects have 8
  rows, one per facing in the same order as the characters, so use the caster's facing row. Self-centred ones have 1
  row.
- Passive skills have a looping aura (loop: true) to show while the passive is active, if you want one.
- Colours are un-premultiplied: normal alpha blending works, and additive blending reads brighter.

## What I need you to do

1. Inspect this repo first. Find the sprite/animation loading, the animation state machine, how abilities are
   represented, and how entities are drawn and depth-sorted. Report what you find. If frame format, origin convention
   or direction naming differ from the above, propose a mapping rather than guessing.
2. Write the adapter so that:
   - a class's JSON + strips load into this engine's existing animation system (don't build a parallel one)
   - locomotion is driven by movement state and `movement_speed_px_per_s` in 8 directions; walk↔run keeps the
     normalised phase; stopping from a run plays `run_stop`
   - casting a skill plays `animation.clip` in the caster's facing, spawns the skill's own VFX sheet at
     `activate_ms` (aligned anchor-to-anchor, with the facing row if it's directional) and applies damage at `hit_ms`; control returns
     at `recover_ms`
   - the skill bar shows each skill's icon; cooldowns, resource cost/gain and effect fields apply from the JSON
   - `data/progression/unlock_schedule.json` decides when skills unlock
   - `attach` points are used for weapon trails, projectile spawn (hand), nameplates (head_top) and footstep dust
3. Keep it data-driven: no per-class or per-skill special cases where the JSON already encodes it.
4. Lazy-load per class (18 classes × ~20 strips + 140 VFX sheets is too much to load up front).

## Final QA once wired up

- For at least 3 classes, in all 8 directions: idle/walk/run loop cleanly with no foot sliding at the given speeds,
  and run_stop settles into idle.
- Cast one skill of each category per class. Check that the right clip plays, the VFX appears at the release frame in
  the right facing and aligned to the body, damage lands on the hit frame, and the icon, cooldown and cost behave.
- Looping VFX hold while their buff is active and stop cleanly when it ends.
- Report what works, what's rough, and anything in the package that was awkward for this engine. Flag it rather than
  patching around it silently.

Ask before restructuring this project's existing animation or rendering architecture. Adapt the package to the
codebase, not the other way round.
