import type { Portal } from '@thistlevane/shared';
import type { ClientContent } from '../content/ContentLoader';

/**
 * A toggleable panel listing every known zone (name, difficulty, description) with the
 * player's current zone marked, and that zone's portal connections. A full graphical world map
 * isn't needed here — a clear, functional list is enough that a player is never left guessing
 * how to travel. A zone's portal list only appears once the player has actually visited it (the
 * data comes from whatever `MapView` already loaded, not a new server endpoint or bulk fetch),
 * so an unvisited zone just shows "no known portals yet" until they get there.
 */
export class MapGuide {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly portalsByZone = new Map<string, Portal[]>();
  private currentZoneId = '';
  private open = false;

  constructor(container: HTMLElement, private readonly content: ClientContent) {
    this.root = document.createElement('div');
    this.root.id = 'map-guide';
    this.root.className = 'panel';

    const header = document.createElement('h2');
    header.textContent = 'Map Guide';
    this.root.appendChild(header);

    const closeHint = document.createElement('div');
    closeHint.className = 'map-guide-hint';
    closeHint.textContent = 'M or Esc to close';
    this.root.appendChild(closeHint);

    this.body = document.createElement('div');
    this.root.appendChild(this.body);

    container.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Call once a zone has actually finished loading, so its portal list becomes available. */
  recordPortals(zoneId: string, portals: Portal[]): void {
    this.portalsByZone.set(zoneId, portals);
    if (this.open) this.render();
  }

  setCurrentZone(zoneId: string): void {
    this.currentZoneId = zoneId;
    if (this.open) this.render();
  }

  toggle(): void {
    this.open = !this.open;
    this.root.classList.toggle('open', this.open);
    if (this.open) this.render();
  }

  close(): void {
    this.open = false;
    this.root.classList.remove('open');
  }

  private render(): void {
    this.body.innerHTML = '';
    for (const [zoneId, zone] of Object.entries(this.content.zones.zones)) {
      const entry = document.createElement('div');
      entry.className = 'zone-entry';
      if (zoneId === this.currentZoneId) entry.classList.add('here');

      const name = document.createElement('span');
      name.className = 'zone-name';
      name.textContent = zone.name;
      entry.appendChild(name);

      if (zone.difficulty) {
        const difficulty = document.createElement('span');
        difficulty.className = 'zone-difficulty';
        difficulty.textContent = zone.difficulty;
        entry.appendChild(difficulty);
      }

      if (zone.description) {
        const description = document.createElement('div');
        description.className = 'zone-description';
        description.textContent = zone.description;
        entry.appendChild(description);
      }

      if (zoneId === this.currentZoneId) entry.appendChild(this.buildPortalList(zoneId));
      this.body.appendChild(entry);
    }
  }

  private buildPortalList(zoneId: string): HTMLElement {
    const list = document.createElement('div');
    const portals = this.portalsByZone.get(zoneId) ?? [];
    if (portals.length === 0) {
      const line = document.createElement('div');
      line.className = 'zone-portals';
      line.textContent = 'No known portals yet.';
      list.appendChild(line);
      return list;
    }
    for (const portal of portals) {
      const target = this.content.zones.zones[portal.targetZone];
      const line = document.createElement('div');
      line.className = 'zone-portals';
      let text = `→ ${target?.name ?? portal.targetZone}`;
      if (portal.requiredLevel !== undefined) text += ` (Lv ${portal.requiredLevel}+)`;
      if (portal.requirements && portal.requirements.length > 0) text += ` [requires: ${portal.requirements.join(', ')}]`;
      line.textContent = text;
      list.appendChild(line);
    }
    return list;
  }
}
