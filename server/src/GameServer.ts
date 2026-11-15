import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tickMs, type GameConfig } from '@thistlevane/shared';
import { loadServerContent, type ServerContent } from './content/loadContent';
import { GameLoop } from './loop/GameLoop';
import { ConnectionManager } from './net/ConnectionManager';
import { WorldManager } from './world/WorldManager';

export interface GameServerOptions {
  /** Folder containing data/, maps/, tilesets/ … (the same one the client serves). */
  assetsDir: string;
  /** Overrides config.network.port; 0 picks a free port (used by tests). */
  port?: number;
  host?: string;
  /** Adjust loaded config (tests). */
  configOverrides?: (config: GameConfig) => void;
}

export interface RunningGameServer {
  port: number;
  worlds: WorldManager;
  content: ServerContent;
  connections: ConnectionManager;
  close(): Promise<void>;
}

/** Load content, wire worlds → loop → network together and start listening. */
export async function startGameServer(options: GameServerOptions): Promise<RunningGameServer> {
  const content = loadServerContent(options.assetsDir, options.configOverrides);
  const { config } = content;
  const worlds = new WorldManager(content);

  const httpServer = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      const zones = Object.fromEntries([...worlds.worlds.values()].map((w) => [w.zoneId, { players: w.players.size, mobs: w.mobs.size }]));
      res.end(JSON.stringify({ ok: true, tick: worlds.tick, players: worlds.playerCount, zones }));
      return;
    }
    res.writeHead(404).end();
  });

  const connections = new ConnectionManager(httpServer, worlds, config, content.characters);
  const loop = new GameLoop(tickMs(config.simulation), () => {
    worlds.step();
    connections.broadcastSnapshot();
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(options.port ?? config.network.port, options.host ?? '0.0.0.0', () => resolve());
  });
  loop.start();

  return {
    port: (httpServer.address() as AddressInfo).port,
    worlds,
    content,
    connections,
    async close() {
      loop.stop();
      await connections.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
