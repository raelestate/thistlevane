import { getWeapon, type PlayerInfo, type ZoneSnapshot } from '@thistlevane/shared';
import type { ServerContent } from '../content/loadContent';
import { log } from '../log';
import { Player } from './Player';
import { World } from './World';

export interface ZoneTransfer {
  player: Player;
  fromZone: string;
  toZone: string;
}

/** Owns one World per zone and moves players between them. */
export class WorldManager {
  readonly worlds = new Map<string, World>();
  private nextPlayerNumber = 1;
  /** Called after a player has been moved to another zone, so the network layer can tell clients. */
  onTransfer: (transfer: ZoneTransfer) => void = () => {};

  constructor(private readonly content: ServerContent) {
    let seed = 1;
    for (const zone of content.maps.values()) {
      this.worlds.set(zone.id, new World(zone.id, zone.map, content.config, content.mobs, seed++));
    }
  }

  get startZone(): World {
    return this.worlds.get(this.content.startZone)!;
  }

  zone(id: string): World | undefined {
    return this.worlds.get(id);
  }

  /** Current tick of the start zone (all zones tick together). */
  get tick(): number {
    return this.startZone.tick;
  }

  get playerCount(): number {
    let n = 0;
    for (const w of this.worlds.values()) n += w.players.size;
    return n;
  }

  join(name: string, characterId: string): Player {
    const world = this.startZone;
    // ConnectionManager already validated characterId against the catalog before calling this.
    const def = this.content.characters.characters.find((c) => c.id === characterId)!;
    const combat = def.combat ?? { maxHp: 100, maxMp: 50, attack: 10, defense: 5 };
    const player = world.addPlayer(`p${this.nextPlayerNumber++}`, name, characterId, combat, getWeapon(def));
    player.zoneId = world.zoneId;
    return player;
  }

  leave(player: Player): void {
    this.worlds.get(player.zoneId)?.removePlayer(player.id);
  }

  /** Advance every zone one tick and resolve portal crossings. */
  step(): void {
    const transfers: ZoneTransfer[] = [];
    for (const world of this.worlds.values()) {
      for (const { player, portal } of world.step()) {
        const target = this.worlds.get(portal.targetZone);
        if (!target || target === world) continue;
        world.removePlayer(player.id);
        target.placePlayer(player, portal.targetSpawn);
        const fromZone = player.zoneId;
        player.zoneId = target.zoneId;
        transfers.push({ player, fromZone, toZone: target.zoneId });
        log('world', `${player.name} (${player.id}) travelled ${fromZone} → ${target.zoneId}`);
      }
    }
    for (const t of transfers) this.onTransfer(t);
  }

  /** Full description of a zone for a client entering it. */
  zoneSnapshot(zoneId: string): ZoneSnapshot {
    const world = this.worlds.get(zoneId)!;
    const players: PlayerInfo[] = [...world.players.values()].map((p) => p.info);
    return { zoneId, tick: world.tick, players, states: world.snapshotStates(), mobs: world.snapshotMobs() };
  }
}
