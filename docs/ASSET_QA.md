# Thistlevane — Asset QA

Visual and technical quality-control results for redesigned assets.

---

## QA Checklist (per asset)

- [ ] Correct frame dimensions
- [ ] Correct column/row count in sprite sheet
- [ ] Transparent background (no stray opaque pixels)
- [ ] No anti-aliasing or blurry edges
- [ ] Colours match approved biome palette
- [ ] Outline colour correct (#2a1f2d or biome variant)
- [ ] Lighting consistent (top-left source)
- [ ] Animation frames maintain volume/proportion
- [ ] Readable at 1x native resolution
- [ ] Passes "Does It Belong?" neighbour test

---

## QA Results

### 2026-11-16 — attack animations, combat effects, HUD icons

Method: build with pxl, read the 16x upscaled `out/_preview/*.png` per asset,
then look at the asset at 1x inside the running game (Chrome, zoom 3) before
approving it.

| Asset | Frames | Checks | Verdict |
|---|---|---|---|
| `rowan.png` attack | 8 dirs x 4f | dimensions, column layout, transparency, outline, ground line | Pass |
| `lilac.png` attack | 8 dirs x 4f | as above; wand tip glow stays inside the frame | Pass |
| `pip.png` attack | 8 dirs x 4f | as above; shorter dagger reach | Pass |
| `ash.png` attack | 8 dirs x 4f | as above; lantern rod amber | Pass |
| `combat.png` slash | 5f | reads as one sweep at 1x; no stray pixels | Pass |
| `combat.png` impact | 5f | **failed first pass** — solid white disc hid the target; redrawn as a spoked spark, re-checked in game | Pass (2nd) |
| `combat.png` target-ring | 1f | sits on the ground under a 24x24 mob; dashes stay readable at 1x | Pass |
| `ui/icons.png` | 6 cells | each icon recognisable at 2x in a 36px slot | Pass (boot + lantern redrawn once) |

Per-asset checklist results for the above:

- [x] Correct frame dimensions (24x32 characters, 24x24 effects, 16x16 icons)
- [x] Correct column/row count (26x8 character sheets; verified by reading the PNG header)
- [x] Transparent background, no stray opaque pixels
- [x] No anti-aliasing (pxl writes indexed colours only)
- [x] Colours drawn from each character's existing ramp plus at most four weapon entries
- [x] Outline colour `#1a1020` (the sheets' existing `K`), 1 px, applied by `outline:`
- [x] Lighting consistent (blade highlight on the top/left edge)
- [x] Frames keep volume and proportion — the body part is stamped unchanged, only
      the limb and weapon move, plus a 1 px lunge on the impact frame
- [x] Readable at 1x native resolution (checked in-game, not only in previews)
- [x] Neighbour test: the swing sits beside idle/walk/run on the same sheet and
      shares their palette and outline

### Known visual nits (not blocking)

- The floating damage number can overlap a nameplate when a mob is directly
  above the player. It is nudged 6 px clear, which handles the common case.
- `slash` plays a tile ahead of the attacker, so on a cliff edge it can draw
  over a tile the player could not actually reach.
- Mob art is still placeholder (`"placeholder": true`), so a sharp weapon now
  meets a soft blob. That contrast is the strongest argument for doing the
  mobs next.

### Screenshots of the implemented result

Captured from the running dev client (Chrome, 1280x800 unless noted):

| File | Shows |
|---|---|
| `docs/screenshots/game-combat.png` | Rowan mid-swing: sword in hand, slash arc, impact spark, damage number, target frame at 25/40 |
| `docs/screenshots/game-combat-lilac.png` | The same moment as Lilac, with her branch wand and her own HP/MP values |
| `docs/screenshots/game-defeated.png` | The killing blow: target frame greyed out, "Defeated", 0/40 |
| `docs/screenshots/game-small-window.png` | 640x480: the HUD scales down and the frames stack |
| `docs/screenshots/asset-attack-strips.png` | All four characters' attack frames (down + left), 7x nearest-neighbour |
| `docs/screenshots/asset-combat-fx.png` | The combat effects sheet preview (slash, impact, target ring) |
| `docs/screenshots/asset-hotbar-icons.png` | The six hotbar icons at 8x |
