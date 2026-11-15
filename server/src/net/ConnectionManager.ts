import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import {
  parseClientMessage,
  rulesFromConfig,
  sanitizeName,
  type CharacterCatalog,
  type GameConfig,
  type ServerMessage,
} from '@thistlevane/shared';
import type { Player } from '../world/Player';
import type { WorldManager, ZoneTransfer } from '../world/WorldManager';
import { log } from '../log';

interface Connection {
  socket: WebSocket;
  player: Player | null;
  alive: boolean;
  windowStart: number;
  messagesInWindow: number;
}

/**
 * Owns all WebSocket connections. Translates validated client intents into
 * world calls and world state into outgoing messages. No game rules live here.
 */
export class ConnectionManager {
  private readonly wss: WebSocketServer;
  private readonly connections = new Set<Connection>();
  private readonly heartbeat: NodeJS.Timeout;
  private readonly characterIds: Set<string>;

  constructor(
    httpServer: HttpServer,
    private readonly worlds: WorldManager,
    private readonly config: GameConfig,
    private readonly characters: CharacterCatalog,
  ) {
    const net = config.network;
    this.characterIds = new Set(characters.characters.map((c) => c.id));
    this.wss = new WebSocketServer({ server: httpServer, path: net.wsPath, maxPayload: net.maxMessageBytes });
    this.wss.on('connection', (socket) => this.onConnection(socket));
    this.heartbeat = setInterval(() => this.checkHeartbeats(), net.heartbeatMs);
    worlds.onTransfer = (t) => this.onTransfer(t);
  }

  get connectionCount(): number {
    return this.connections.size;
  }

  /** Send each joined client the state near its player (area of interest). Called once per tick. */
  broadcastSnapshot(): void {
    const radius = this.config.network.interestRadiusTiles;
    for (const conn of this.connections) {
      const player = conn.player;
      if (!player || conn.socket.readyState !== WebSocket.OPEN) continue;
      if (conn.socket.bufferedAmount > this.config.network.maxBufferedBytes) continue;
      const world = this.worlds.zone(player.zoneId);
      if (!world) continue;
      const near = world.nearby(player.state.tileX, player.state.tileY, radius);
      conn.socket.send(
        JSON.stringify({ type: 'snapshot', tick: world.tick, ackSeq: player.lastAppliedSeq, players: near.players, mobs: near.mobs }),
      );
    }
  }

  close(): Promise<void> {
    clearInterval(this.heartbeat);
    for (const conn of this.connections) conn.socket.terminate();
    return new Promise((resolve) => this.wss.close(() => resolve()));
  }

  private onConnection(socket: WebSocket): void {
    const conn: Connection = { socket, player: null, alive: true, windowStart: Date.now(), messagesInWindow: 0 };
    this.connections.add(conn);
    socket.on('pong', () => (conn.alive = true));
    socket.on('message', (data, isBinary) => this.onMessage(conn, data, isBinary));
    socket.on('close', () => this.onClose(conn));
    socket.on('error', (err) => log('net', `socket error: ${err.message}`));
  }

  private onMessage(conn: Connection, data: RawData, isBinary: boolean): void {
    if (!this.withinRateLimit(conn)) {
      log('net', `closing ${conn.player?.id ?? 'unjoined connection'}: message rate limit exceeded`);
      conn.socket.close(1008, 'rate limit');
      return;
    }
    if (isBinary) return;
    const msg = parseClientMessage(data.toString());
    if (!msg) return; // Malformed or unknown: ignore.

    switch (msg.type) {
      case 'join': {
        if (conn.player) return; // Already joined.
        const { maxNameLength, defaultName } = this.config.players;
        const characterId =
          msg.characterId && this.characterIds.has(msg.characterId) ? msg.characterId : this.characters.defaultCharacter;
        const player = this.worlds.join(sanitizeName(msg.name, maxNameLength, defaultName), characterId);
        conn.player = player;
        this.send(conn, {
          type: 'welcome',
          yourId: player.id,
          rules: rulesFromConfig(this.config),
          ...this.worlds.zoneSnapshot(player.zoneId),
        });
        this.broadcastInZone(player.zoneId, { type: 'playerJoined', player: player.info }, conn);
        log(
          'world',
          `${player.name} (${player.id}, ${characterId}) joined ${player.zoneId} at ${player.state.tileX},${player.state.tileY} — ${this.worlds.playerCount} online`,
        );
        return;
      }
      case 'input': {
        if (!conn.player) return;
        this.worlds.zone(conn.player.zoneId)?.queueInput(conn.player.id, msg.seq, msg);
        return;
      }
    }
  }

  private onTransfer({ player, fromZone, toZone }: ZoneTransfer): void {
    const conn = [...this.connections].find((c) => c.player === player);
    this.broadcastInZone(fromZone, { type: 'playerLeft', id: player.id }, conn);
    if (conn) this.send(conn, { type: 'zoneChange', ...this.worlds.zoneSnapshot(toZone) });
    this.broadcastInZone(toZone, { type: 'playerJoined', player: player.info }, conn);
  }

  private onClose(conn: Connection): void {
    this.connections.delete(conn);
    const player = conn.player;
    if (!player) return;
    this.worlds.leave(player);
    this.broadcastInZone(player.zoneId, { type: 'playerLeft', id: player.id });
    log('world', `${player.name} (${player.id}) left — ${this.worlds.playerCount} online`);
  }

  private withinRateLimit(conn: Connection): boolean {
    const now = Date.now();
    if (now - conn.windowStart >= 1000) {
      conn.windowStart = now;
      conn.messagesInWindow = 0;
    }
    conn.messagesInWindow += 1;
    return conn.messagesInWindow <= this.config.network.maxMessagesPerSecond;
  }

  private checkHeartbeats(): void {
    for (const conn of this.connections) {
      if (!conn.alive) {
        log('net', `${conn.player?.id ?? 'connection'} timed out`);
        conn.socket.terminate(); // Triggers 'close' → normal cleanup.
        continue;
      }
      conn.alive = false;
      conn.socket.ping();
    }
  }

  private send(conn: Connection, msg: ServerMessage): void {
    if (conn.socket.readyState === WebSocket.OPEN) conn.socket.send(JSON.stringify(msg));
  }

  private broadcastInZone(zoneId: string, msg: ServerMessage, except?: Connection): void {
    const data = JSON.stringify(msg);
    for (const conn of this.connections) {
      if (conn === except || !conn.player || conn.player.zoneId !== zoneId || conn.socket.readyState !== WebSocket.OPEN) continue;
      conn.socket.send(data);
    }
  }
}
