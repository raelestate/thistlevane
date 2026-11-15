import type { ClientMessage, ServerMessage } from '@thistlevane/shared';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

/**
 * Thin typed wrapper around the browser WebSocket. No game logic here.
 * Reconnection is deliberately not implemented yet (Milestone 2).
 */
export class NetClient {
  status: ConnectionStatus = 'connecting';
  onMessage: (msg: ServerMessage) => void = () => {};
  onStatusChange: (status: ConnectionStatus) => void = () => {};
  private readonly socket: WebSocket;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.addEventListener('open', () => this.setStatus('open'));
    this.socket.addEventListener('close', () => this.setStatus('closed'));
    this.socket.addEventListener('error', () => console.error('[net] WebSocket error'));
    this.socket.addEventListener('message', (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        console.warn('[net] ignoring non-JSON message from server');
        return;
      }
      this.onMessage(msg);
    });
  }

  /** Same origin by default (Vite proxies the WS path); `?server=ws://host:port/path` overrides. */
  static defaultUrl(wsPath: string): string {
    const override = new URLSearchParams(location.search).get('server');
    if (override) return override;
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${scheme}://${location.host}${wsPath}`;
  }

  send(msg: ClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(msg));
  }

  close(): void {
    this.socket.close();
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.onStatusChange(status);
  }
}
