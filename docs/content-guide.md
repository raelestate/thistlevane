# Content guide

All game content and tuning live in `assets/`. The server and the browser read the **same files**; no map, character, tile, effect or tuning value is written in code. Restart `npm run dev` after editing data files (the browser just needs a refresh).

```
assets/
  data/game-config.json   tuning: tick rate, walk/run speed, turn delay, player blocking,
                          network limits, camera, controls, name label style
  data/zones.json         zone registry: id → name + Tiled file; which zone players start in
  data/characters.json    playable characters: sheet, frame size, rows, animations, step effects
  data/mobs.json          monsters: sheet layout, walk speed, wander behaviour (combat comes later)
  data/effects.json       one-shot effects (dust, leaves, splash): sheet, frames, fps, anchor, layer
  maps/*.json             Tiled maps, one per zone (tilesets embedded), 500×500 tiles
  tilesets/ characters/ mobs/ effects/   images
```

Invalid data fails at startup with a message naming the bad field (for example `game-config.json.movement.walkTicksPerTile must be posInt`).

## Tuning movement (`game-config.json → movement`)

| Key | Meaning |
|---|---|
| `walkTicksPerTile` | Ticks per tile while walking (with `tickRate` 20: 5 = 4 tiles/s) |
| `runTicksPerTile` | Ticks per tile while running (3 ≈ 6.7 tiles/s) |
| `turnDelayTicks` | When you press a new direction while standing still, the character turns first and only starts walking if the key is still held after this many ticks. 0 turns it off. |
| `playersBlockEachOther` | Players can't share or pass through tiles |

The server sends these rules to every client when it joins, so prediction always matches the server.

## Adding a character

1. Draw a spritesheet: one row per direction (`rows` maps the 8 `Direction` ids to row numbers) and columns for each animation you support (`idle`/`walk` required, `run` required for characters, `run_stop`/`attack`/`hit`/`death` optional), all animations sharing the same row set.
2. Add an entry to `data/characters.json` describing the sheet: frame size, `rows`, the start column, frame count and fps for each animation, the `anchor` (the feet point inside the frame), and optional `effects.walkStep` / `effects.runStep` / `effects.attackHit` effect ids.
3. Open the game with `?character=<id>`.

The current cast (Corin Ashvale + 18 classes) was converted from two delivered sprite packs into this layout; see `assets/data/classes.json`, `balance-framework.json` and `unlock-schedule.json` for the class/skill design reference not yet wired into gameplay (Milestones 4-5).

## Zones, portals and elevation

Each zone is one Tiled map registered in `data/zones.json`; `world.startZone` in `game-config.json` picks where new players appear.
The server runs every zone at once. A player standing on a **portal** (object layer `portals`, type `portal`, properties `targetZone`, `targetSpawn`) is moved to that zone's named spawn point and the client loads the new map.

Maps use a 3/4 perspective with **elevation**: a hidden `elevation` tile layer gives each cell a `level` (tile property). Moving between cells of different levels is blocked, except through cells whose tile has `ramp: true`. Cliff faces are ordinary `collides` tiles drawn in the cell south of a drop. The server enforces all of this from the data; the client predicts with the same rules.

**Mob spawns:** rectangles on the `spawns` layer with type `mob_spawn` and properties `mob` (id from `mobs.json`) and `count`. Mobs wander inside their rectangle and block tiles like players do. Clients only receive entities within `network.interestRadiusTiles` of their player.

## Making and editing maps (Tiled)

Register the map in `data/zones.json`. Embed tilesets in the map (Tiled → *Embed Tileset*). Layer data must be uncompressed (CSV/array).

**Layers**
- Every visible tile layer is drawn in order.
- Layers with the custom property `aboveCharacters = true` are drawn over players (tree canopies).
- The layer named in `world.layers.collision` (default `collision`) is invisible; any non-empty tile there blocks movement.
- The object layer named in `world.layers.spawns` holds point objects whose type/class is `world.layers.spawnType` (`player_spawn`).

**Tile properties** (set on the tile in the tileset editor)

| Property | Type | Effect |
|---|---|---|
| `collides` | bool | Blocks movement (server-enforced) |
| `walkable` | bool | On a higher layer, un-blocks a cell that a lower layer's `collides` tile blocked (bridge planks over water) |
| `stepEffect` | string | Effect id played when a player enters the tile |
| `stepAnimation` | string | One-shot tile animation when entered, JSON `[{"tileid":12,"duration":200}, …]` |
| `rustleAnimation` | string | One-shot animation when a player walks past (adjacent) or bumps into it |
| `bumpEffect` | string | Effect id played when a player walks into it |
| `desync` | bool | Offsets this tile's looping animation per position, so a field of grass doesn't sway in lockstep |
| `level` | int | Elevation of the cell (usually on the hidden `elevation` layer) |
| `ramp` | bool | Allows stepping between elevations through this cell |

Looping animations use Tiled's normal tile *Animation* editor.

### Generating the zones

`node tools/world/generate.mjs [--size 500] [--preview] [zone …]` regenerates the four zone maps and their tilesets from `tools/world/biomes.mjs` (palettes, props, relief, mobs, portals). It auto-tiles ground patches, paths, water (shoreline + ripples), plateau rims, cliff faces and ramps from neighbour masks, places props with lit volumes (Codixel core), spawn points, portals and mob regions. `--preview` writes overview images to `tools/world/preview/`. Generated maps are ordinary Tiled files: once you hand-edit one, stop regenerating it.

`tools/art/mobs.mjs` writes the **placeholder** mob sheets and `mobs.json`; it's a stand-in until reference-based mob art is produced (see `tools/art/codixel/SKILL.md`). Character art is no longer generated by a script in this repo — see "Adding a character" above.

## Huge maps

Maps are 500×500 (250k cells). The client keeps only a window (`client.chunk` in `game-config.json`) of the map in the renderer and refills it as the camera moves; the server keeps the whole map in compact typed arrays.

## Effects

Add an entry to `data/effects.json` with these fields:
- `sheet`, `frameWidth` and `frameHeight` for the spritesheet;
- `startFrame` (index in the sheet) and `frames`;
- `frameRate`;
- `anchor`;
- `layer`: `below` or `above` characters.

Then refer to the effect by id from characters or tile properties.

## Controls

`game-config.json → client.controls` maps actions to `KeyboardEvent.code` values (`KeyW`, `ArrowUp`, `ShiftLeft`, …).
