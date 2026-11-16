# Thistlevane — Development Checklist

Legend: `[x]` Completed (implemented **and** verified) · `[~]` Ongoing · `[ ]` Pending · `[!]` On hold / blocked

Last updated: 2026-11-16 (iteration 4)

## Milestone 0 — Multiplayer Proof of Concept — **[x] Complete**

Signed off by the project owner after a manual two-window test.

| Task | Status | Verified by |
|---|---|---|
| Monorepo, shared protocol + movement rules | [x] | typecheck + unit tests |
| Authoritative server, fixed tick loop, validation, rate limits | [x] | integration tests |
| Client prediction + reconciliation, remote interpolation | [x] | browser tests, 0 corrections |
| Two independent browser sessions see each other move | [x] | Playwright + manual check by owner |
| Heartbeat drops dead connections | [~] | implemented; no automated test (needs ~20 s) |

## Iteration 1 — Feel, art, blocking, data-driven content

These items were requested by the project owner after Milestone 0. They pull a few Milestone 1, 3 and 8 items forward.

| Task | Status | Verified by |
|---|---|---|
| All content + tuning moved to `assets/data` + Tiled (no hardcoded maps, tiles, characters, speeds, keys) | [x] | code scan; config validation tests; server + client load the same files |
| Tile behaviour from Tiled properties (`collides`, `stepEffect`, `rustleAnimation`, `bumpEffect`, `desync`) | [x] | unit test: every `collides` tile is blocked; browser screenshots |
| 4 original chibi characters (rowan, lilac, pip, ash), 4 directions × idle/walk/run *(generated placeholder art)* | [x] | visual check; animation keys verified in browser |
| Animated tiles: grass tufts, flowers, tall grass, water, lilies, thistles, tree canopies (desynced) | [x] | browser: tile indices change over time |
| Reactions: tall grass flattens + leaves; bushes rustle when passed/bumped; water splashes on bump | [x] | implemented; seen in screenshots (dust); not all asserted automatically |
| Footstep dust (walk/run), effects defined in `effects.json` | [x] | screenshots |
| Running (hold Shift), server-validated | [x] | integration test; browser: 8 tiles in ~1.2 s |
| Turn in place (tap to turn, hold to walk) | [x] | unit + integration tests |
| Players block each other (server-enforced, predicted on client) | [x] | unit + integration tests; browser test: walking into another player only turns |
| Smooth camera follow, walk↔run stride continuity | [x] | browser check |
| Server input jitter buffer (steady remote motion) | [x] | frame sampling: walk/run animations no longer flicker; 0 backward jumps |
| Remote animation continuity (no idle flashes) | [x] | frame sampling: one continuous walk/run run per movement |
| **Manual check on your machine** | [x] | Owner: "so amazing" |

## Iteration 2 — Art pass + bigger map

| Task | Status | Verified by |
|---|---|---|
| Characters v2: rounder chibi proportions, hue-shifted 4-tone ramps, per-material outlines, 6-frame idle (breathing + blink), 8-frame walk and run with hair bounce | [x] | visual check; animation keys in browser |
| Auto-tiled ground materials (dirt, cobblestone, tilled soil, water with shoreline + 4-frame ripples), rounded edges | [x] | map render; browser screenshots |
| New objects: 32×48 trees with swaying canopies, bushes, rocks, stumps, logs, fences, bridge, crops, lilies, mushrooms, 3 flower types, tufts, tall grass | [x] | map render |
| Map enlarged to 80×56 (was 48×34): forest border, winding river + bridge, pond, cobbled plaza, farm plot, meadows, tall-grass patches | [x] | map render; browser tour across the bridge |
| `walkable` tile property (bridge overrides water collision), shared by server + client | [x] | unit test; browser: crossed the bridge with 0 corrections |
| Two-browser regression (blocking, run, cross-check positions, disconnect) | [x] | Playwright: identical positions, 0 corrections, no console errors |
| **Manual check on your machine** | [ ] | Your turn |

### Known limitations
- Art is still procedurally generated placeholder art. It is a clear step up, but hand-drawn (or licensed) sprites will always beat a generator; the pipeline is ready for them (drop a sheet in `assets/`, describe it in the JSON).
- Tall grass doesn't hide the character's feet yet (needs an overlay pass).
- Only one tileset/biome so far (meadow).
- Two players racing for the same tile: the loser sees a small snap-back (server wins).
- No reconnect, no accounts, no area-of-interest filtering (Milestone 2).
- Name labels and the HUD are debug UI (Milestones 1/7).
- Tested on localhost only; behaviour under real latency/jitter not yet measured.

## Iteration 3 — Four zones, 500×500 maps, elevation, mobs (pulls Milestone 2/3/4 items forward at the owner's request)

| Task | Status | Verified by |
|---|---|---|
| Zone registry + 4 generated zones (Barren Grasslands, Wastelands, Thistlevane Hollow, Frostvane Peaks), 500×500 each | [x] | generator output; map validation tests for all four |
| 3/4 perspective terrain: plateaus with rims, cliff faces, ramps; elevation rule shared server/client | [x] | unit test: every level change is blocked unless via ramp, in all zones |
| Auto-tiled ground patches, paths, cobble, soil, water with shoreline + ripples, ice | [x] | previews + browser screenshots |
| Biome props with lit volumes (trees, pines, twisted trees, cacti, rocks, bushes, ruins, decor) | [x] | previews |
| Portals between zones; server transfers players; client rebuilds scene | [x] | integration test: walk onto portal → `zoneChange`, arrives at target spawn |
| Mobs: 15 kinds defined in `mobs.json`, spawn regions in maps, wander AI on server, rendered on client | [x] | integration test (wander, stay in region, no overlap); browser: 20+ mobs near spawn |
| Area-of-interest snapshots (players + mobs within 40 tiles) | [x] | integration test; browser: Bob stops seeing Alice beyond range |
| Windowed tilemap rendering for huge maps | [x] | browser: ran 46 tiles across refills, 0 errors, flat memory |
| Placeholder mob + character art, clearly flagged | [x] | `placeholder: true` in mobs.json |
| **Reference-based character & mob art (Codixel method)** | [!] | **Blocked: needs reference images from the owner** (see chat) |
| **Manual check on your machine** | [ ] | Your turn |

### Known limitations
- Character and mob art are placeholders until references arrive.
- Mobs only wander; no aggro or combat (Milestone 4).
- When a mob steps into your path you may see a one-tile correction.
- Map JSON is ~3 MB per zone; first load of a zone takes a second or two on localhost.
- Portal test uses a test-only teleport next to the portal (walking 250 tiles is too slow for a test).

## Iteration 4 — Attack animation + MMORPG interface (art pass; no gameplay systems changed)

| Task | Status | Verified by |
|---|---|---|
| Attack animation, 4 frames x 8 directions, for all four characters (sheets 22 -> 26 columns) | [x] | pxl previews at 16x; in-game: `character:<id>:attack:<dir>` plays and returns to idle |
| Per-character weapons (sword / dagger / branch wand / lantern rod) | [x] | side-by-side preview of all four attack strips |
| Combat effects sheet: slash arc, impact spark, target ring | [x] | previews + screenshots of a live fight |
| Hotbar icon sheet (6 icons, 16x16) | [x] | preview; readable at 2x in the running HUD |
| HP / MP / XP bars, player unit frame with portrait, level and title | [x] | browser: `130 / 130`, `40 / 40`, portrait drawn from the sheet |
| Target frame: portrait, level, health, defeated state | [x] | browser: Slime Lv 1, 40 -> 25 -> 11 -> 0, frame greys out |
| Target selection: click a mob, Tab for the nearest on screen, Esc to clear | [x] | browser: Tab selects, ring follows, Esc clears |
| Six-slot hotbar with keybinds, cooldown wipe and locked slots | [x] | browser: cooldown height animates 0 -> 100%, slots 2-6 say "not learned" |
| Combat indicators: damage / crit / miss / XP numbers, hit flash, nameplate health bars | [x] | screenshots of a full kill |
| HUD scales down on small windows | [x] | browser at 640x480: frames stack, hint hides, hotbar shrinks |
| Directional movement + animation transitions after the sheet change | [x] | browser: all 8 directions walk/run/idle, 0 corrections |
| Sprite alignment unchanged by the wider sheets | [x] | anchors/foot offsets untouched; feet still sit on the tile line |
| Typecheck + unit and multiplayer integration tests | [x] | `npm run typecheck`, `npm test` both green |
| Production build | [x] | `npm run build` |
| **Manual check on your machine** | [ ] | Your turn |

### Known limitations
- **Combat is a client-side preview only.** The server has no combat (Milestone 4):
  mob health, damage rolls, cooldowns, mana and XP live in your browser tab and
  reset when the mob leaves interest range or you change zone. Another player
  does not see your hits. `client/src/combat/CombatPreview.ts` is the seam where
  server results will replace the local rolls.
- Only the first hotbar slot does anything; slots 2-6 are drawn and locked.
- Player health never changes — nothing attacks you yet.
- Mobs have no hurt or death animation (their sheets have none), so a defeated
  mob dims instead of playing a death.
- Mob art is still placeholder.

## Milestone 1 — Character System
Partly started by Iteration 1: spritesheets, idle/walk animations, 4 directions, appearance variety.
Iteration 4 added the attack animation, HP/MP/XP bars, nameplates and health bars (interface only).
Still to do: hurt/death animations, server-side health, real levelling.

## Milestones 2–10
[ ] Not started.
