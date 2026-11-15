# 0001 — Technology stack

**Status:** accepted (Milestone 0)

- **TypeScript everywhere.** Client and server share protocol types and movement code (`shared/`), so message mismatches fail at compile time.
- **Phaser 4 (client).** Phaser 4.x was the stable `latest` release when the project started; its tilemap, sprite and camera APIs match what we need. Phaser 3 was the alternative; we chose the actively developed major version.
- **Vite (client build).** Fast dev server, and its proxy gives the client a same-origin `/ws` WebSocket in development.
- **Node.js + `ws` (server).** Plain WebSockets instead of Socket.IO: smaller, transparent protocol, no fallback transports we don't need. Reconnect will be written in Milestone 2.
- **Tiled JSON maps.** One file read by both the server (collision, spawns) and client (rendering).
- **`node:test` + `tsx`.** Built-in test runner; no extra framework.
- **No database yet.** PostgreSQL arrives with accounts in Milestone 2.
