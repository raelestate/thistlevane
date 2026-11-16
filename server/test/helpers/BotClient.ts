import { WebSocket } from 'ws';
import { type ClientMessage, type Direction, type ServerMessage, type SnapshotMessage } from '@thistlevane/shared';

/**
 * A scripted, independent network client used by tests. It talks to a real
 * server over a real WebSocket, exactly like a browser would.
 */
export class BotClient {
  /** Set by tests from the loaded game config. */
  static wsPath = '';
  readonly messages: ServerMessage[] = [];
  yourId = '';
  private seq = 0;
  private attackSeqCounter = 0;
  private waiters: Array<{ predicate: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }> = [];

  private constructor(readonly socket: WebSocket) {
    socket.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as ServerMessage;
      this.messages.push(msg);
      if (msg.type === 'welcome') this.yourId = msg.yourId;
      this.waiters = this.waiters.filter((w) => {
        if (!w.predicate(msg)) return true;
        w.resolve(msg);
        return false;
      });
    });
  }

  static async connect(port: number, wsPath = BotClient.wsPath): Promise<BotClient> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${wsPath}`);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    return new BotClient(socket);
  }

  static async join(port: number, name: string, characterId?: string): Promise<BotClient> {
    const bot = await BotClient.connect(port);
    bot.send({ type: 'join', name, characterId });
    await bot.waitFor((m) => m.type === 'welcome');
    return bot;
  }

  send(msg: ClientMessage | Record<string, unknown>): void {
    this.socket.send(JSON.stringify(msg));
  }

  sendRaw(data: string): void {
    this.socket.send(data);
  }

  /** Send one tick worth of input. Returns the seq used. */
  input(dir: Direction | null, run = false): number {
    this.seq += 1;
    this.send({ type: 'input', seq: this.seq, dir, run });
    return this.seq;
  }

  /** Hold a direction for `ticks` ticks, paced at the real tick rate like a browser client. */
  async hold(dir: Direction | null, ticks: number, tickMs: number, run = false): Promise<number> {
    let last = 0;
    for (let i = 0; i < ticks; i++) {
      last = this.input(dir, run);
      await sleep(tickMs);
    }
    return last;
  }

  /** Send one basic-attack attempt aimed in `aim`. Returns the seq used (its own, independent counter). */
  attack(aim: Direction): number {
    this.attackSeqCounter += 1;
    this.send({ type: 'attack', seq: this.attackSeqCounter, aim });
    return this.attackSeqCounter;
  }

  waitFor(predicate: (m: ServerMessage) => boolean, timeoutMs = 3000): Promise<ServerMessage> {
    const existing = this.messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for message')), timeoutMs);
      this.waiters.push({
        predicate,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  }

  /** Wait for a snapshot arriving after now that satisfies `predicate`. */
  nextSnapshot(predicate: (s: SnapshotMessage) => boolean = () => true, timeoutMs = 3000): Promise<SnapshotMessage> {
    const startIndex = this.messages.length;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for snapshot')), timeoutMs);
      const check = (m: ServerMessage) =>
        m.type === 'snapshot' && this.messages.indexOf(m) >= startIndex && predicate(m);
      this.waiters.push({
        predicate: check,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as SnapshotMessage);
        },
      });
    });
  }

  snapshots(): SnapshotMessage[] {
    return this.messages.filter((m): m is SnapshotMessage => m.type === 'snapshot');
  }

  close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise((resolve) => {
      this.socket.once('close', () => resolve());
      this.socket.close();
    });
  }

  waitForClose(timeoutMs = 3000): Promise<number> {
    if (this.socket.readyState === WebSocket.CLOSED) return Promise.resolve(-1);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket did not close')), timeoutMs);
      this.socket.once('close', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
