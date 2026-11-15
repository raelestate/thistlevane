import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The repo's assets/ folder is served as-is at the site root, so the browser
// fetches exactly the same data files (config, maps, characters…) the server reads.
const assetsDir = fileURLToPath(new URL('../assets', import.meta.url));
const config = JSON.parse(readFileSync(`${assetsDir}/data/game-config.json`, 'utf8'));
const gameServer = process.env.THISTLEVANE_SERVER ?? `http://localhost:${config.network.port}`;

export default defineConfig({
  publicDir: assetsDir,
  server: {
    port: 5173,
    proxy: {
      // Same-origin WebSocket in development: /ws on Vite is forwarded to the game server.
      [config.network.wsPath]: { target: gameServer, ws: true },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000, // Phaser alone is ~1.4MB minified.
  },
});
