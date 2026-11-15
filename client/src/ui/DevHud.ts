import type { ClientContent } from '../content/ContentLoader';
import type { ConnectionStatus } from '../net/NetClient';

/**
 * Developer overlay: connection state and sync diagnostics.
 * Not the real game UI (that is Milestone 7).
 */
export class DevHud {
  private status: ConnectionStatus = 'connecting';
  private identity = '';
  private error = '';
  private loading = '';
  private lastText = '';
  private readonly controlsHint: string;
  private readonly characterHint: string;

  constructor(
    private readonly element: HTMLElement | null,
    content: ClientContent,
  ) {
    const c = content.config.client.controls;
    const pretty = (codes: string[]) => codes.map((k) => k.replace(/^Key/, '').replace(/^Arrow/, '')).join('/');
    this.controlsHint = `Move: ${[c.up, c.left, c.down, c.right].map(pretty).join(' ')} · Run: hold ${pretty(c.run)}`;
    this.characterHint = `Characters (?character=): ${content.characters.characters.map((ch) => ch.id).join(', ')}`;
  }

  setStatus(status: ConnectionStatus): void {
    this.status = status;
  }

  setIdentity(name: string, id: string, characterId: string): void {
    this.identity = `${name} (${id}, ${characterId})`;
  }

  setError(message: string): void {
    this.error = message;
  }

  setLoading(zoneName: string): void {
    this.loading = zoneName;
  }

  update(stats: { zone: string; tile: string; playerCount: number; mobCount: number; corrections: number; pendingInputs: number; gait: string }): void {
    if (!this.element) return;
    let text: string;
    if (this.error) {
      text = `Error: ${this.error}`;
    } else if (this.status === 'closed') {
      text = 'Disconnected from server — refresh to rejoin.';
    } else if (this.loading) {
      text = `Entering ${this.loading}…`;
    } else if (this.status === 'connecting' || !this.identity) {
      text = 'Connecting…';
    } else {
      text =
        `Thistlevane · dev build · ${stats.zone}\n` +
        `You: ${this.identity} · ${stats.gait} · tile ${stats.tile}\n` +
        `Nearby: ${stats.playerCount} players, ${stats.mobCount} mobs · Corrections: ${stats.corrections} · Unacked: ${stats.pendingInputs}\n` +
        `${this.controlsHint}\n${this.characterHint}`;
    }
    if (text === this.lastText) return; // avoid touching the DOM every frame
    this.lastText = text;
    this.element.textContent = text;
    this.element.classList.toggle('bad', this.status === 'closed' || !!this.error);
  }
}
