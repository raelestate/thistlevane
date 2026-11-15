# 0004 — Multiple zones, elevation, wandering mobs, huge maps

**Status:** accepted (iteration 3)

## Decisions
- **One server, many worlds.** `WorldManager` runs one `World` per zone, all on the same tick. Portals (Tiled objects) move a player between worlds; the client receives `zoneChange` and rebuilds its scene.
- **Elevation is data.** Each cell has a `level`; steps between levels are only allowed through `ramp` cells. The rule lives in `MapModel.isWalkable(x, y, fromX, fromY)` and is shared by server and client prediction. Cliff faces are plain colliding tiles. This gives the 3/4 "perspective" look without any special-case rendering.
- **Mobs reuse the player movement rules.** A `Mob` drives a `PlayerState` through `stepMovement` with its own speed, so cliffs, ramps and blocking apply to it automatically. Behaviour is wander-only until Milestone 4 (combat).
- **Area of interest.** Snapshots contain only entities within `network.interestRadiusTiles` of the receiving player. The client already treats "missing from snapshot" as "gone", so entities fade in and out naturally.
- **Windowed rendering.** Phaser would allocate a Tile object per cell per layer (1.25M for one zone). Instead a 72×48 window is filled from the raw layer arrays and moved with the camera; the tile animator rescans the window on each refill.
- **Procedural zones from biome definitions** using the Codixel core for lit surfaces. Reference-based character/mob art is produced separately (Codixel method) and dropped in through the JSON catalogues.

## Consequences
- Prediction of other movers uses their last snapshot position, so when a mob steps into the player's path a one-tile correction can occur. Acceptable now; combat will revisit mob collision anyway.
- Map JSON is ~3 MB per zone (uncompressed); production hosting should gzip/brotli (Milestone 9).
- A single process still hosts all zones; sharding comes with Milestone 9 if ever needed.
