# 0002 — Server-authoritative grid movement with client prediction

**Status:** accepted (Milestone 0)

## Decision
- Movement is **grid-based, 4-directional**. One tile takes 5 ticks (250 ms at 20 Hz). Direction changes take effect at tile boundaries.
- The **server is authoritative** from day one. Clients send only intents: `input { seq, dir }`, one per local tick while a key is held or a step is finishing.
- The movement rule (`shared/src/movement.ts → stepMovement`) is a single function run by both server and client.

## Why
- Grid movement makes validation trivial (a tile lookup) and makes later monster pathfinding simple (A* on the same grid).
- Retrofitting authority later is one of the most expensive rewrites in multiplayer games.

## How sync works
1. **Local player (prediction):** the client applies its input immediately, sends it, and keeps it in a pending list. Each snapshot carries `ackSeq`; the client resets to the server's state and replays inputs with a higher seq. Because both sides run the same function, this normally produces no correction; if the server disagrees, the server wins.
2. **Remote players (interpolation):** rendered 100 ms in the past, blending between the two snapshots around that time.
3. **Speed-hack guard:** each player earns one input credit per server tick (max 4 banked for jitter). Sending inputs faster than 20/s cannot move a player faster.
4. **Silent clients:** if no input arrives for 3 ticks, the server finishes any half-done step, so a backgrounded tab never leaves a player frozen between tiles.

## Consequences
- Snapshots are full state for all players every tick. That's fine for dozens of players on one map; area-of-interest filtering is a Milestone 2 task.
- The client's simulation clock uses wall time (`performance.now()`), not Phaser's smoothed `delta`, which would let the local simulation run slower than the server. A browser test caught this (4 tiles instead of 6–7 in 1.5 s).
