import { fileURLToPath } from 'node:url';
import { startGameServer } from './GameServer';
import { log } from './log';

// Content folder: THISTLEVANE_ASSETS env var, else the repo's assets/ folder.
const assetsDir = process.env.THISTLEVANE_ASSETS ?? fileURLToPath(new URL('../../assets', import.meta.url));
const port = process.env.PORT ? Number(process.env.PORT) : undefined;

const server = await startGameServer({ assetsDir, port });
const { config } = server.content;
log(
  'server',
  `Thistlevane game server listening on ws://localhost:${server.port}${config.network.wsPath} ` +
    `(${config.simulation.tickRate} ticks/sec, zones: ${[...server.worlds.worlds.keys()].join(', ')}, assets ${assetsDir})`,
);

async function shutdown(signal: string): Promise<void> {
  log('server', `${signal} received, shutting down`);
  await server.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
