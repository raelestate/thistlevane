# 0003 — Data-driven content, shared by server and client

**Status:** accepted (post-Milestone 0 iteration)

## Decision
- All content and tuning live in `assets/` (see `docs/content-guide.md`). Code contains mechanisms, not content: no tile ids, character names, speeds, map names or key codes.
- Vite serves `assets/` as its public folder, so the browser fetches the exact files the server reads from disk.
- Tile behaviour is set by **Tiled tile properties** (`collides`, `stepEffect`, `rustleAnimation`, …). For example, painting a water tile automatically makes it block movement and splash on contact.
- The server is the authority for rules that affect gameplay. It sends `rules` (tick rate + movement) in `welcome`; the client predicts with those, not its own copy.
- Every data file is validated at load time with readable errors.

## Why
- Designers can change maps, characters and tuning without touching code.
- It's impossible for client and server to disagree on collision or speed.

## Related changes in this iteration
- **Run** (hold Shift): validated server-side. Speed comes from `runTicksPerTile`, and the input-credit budget still caps how fast inputs are processed.
- **Turn in place:** from a standstill, a tap turns the character; holding the key walks. The delay comes from `turnDelayTicks`.
- **Player blocking:** a walking player reserves both the tile it is leaving and the tile it is entering. The server resolves races; prediction uses the latest snapshot and is corrected if wrong.
- **Server input jitter buffer** (`inputJitterBufferTicks`): inputs are consumed at a steady one per tick, so other players see smooth motion instead of stop-start steps when packets arrive unevenly.
- **Remote animation** uses the server's "step in progress" flag, so a repeated snapshot doesn't flash the idle pose.
