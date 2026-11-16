import { DIRECTION_DELTAS, type Direction } from '@thistlevane/shared';

/** How close a projectile must get to a candidate's position to count as a hit. */
export const PROJECTILE_HIT_RADIUS_TILES = 0.4;

/**
 * Server-simulated ranged attack: continuous position/velocity/lifetime,
 * authoritative collision. Clients never receive per-tick position for this —
 * they get one spawn event and replay the flight cosmetically; only the
 * server's own collision result (a later `hit` event) is trusted for damage.
 */
export class Projectile {
  x: number;
  y: number;
  private readonly velX: number; // tiles per tick
  private readonly velY: number;
  private ticksLeft: number;

  constructor(
    readonly id: string,
    readonly sourceId: string,
    /** A player's shot can hit mobs and other players; a mob's shot only hits players (still no mob-vs-mob). */
    readonly canHitMobs: boolean,
    readonly canHitPlayers: boolean,
    originX: number,
    originY: number,
    readonly aim: Direction,
    /** Attacker's attack stat, frozen at spawn time so a later buff/death doesn't retroactively change it. */
    readonly attack: number,
    speedTilesPerSec: number,
    rangeTiles: number,
    tickRate: number,
  ) {
    this.x = originX;
    this.y = originY;
    const { dx, dy } = DIRECTION_DELTAS[aim];
    const mag = Math.hypot(dx, dy) || 1;
    const speedTilesPerTick = speedTilesPerSec / tickRate;
    this.velX = (dx / mag) * speedTilesPerTick;
    this.velY = (dy / mag) * speedTilesPerTick;
    this.ticksLeft = Math.max(1, Math.ceil(rangeTiles / speedTilesPerTick));
  }

  /** Advances one tick. Returns false once its range/lifetime is spent (caller removes it). */
  advance(): boolean {
    this.x += this.velX;
    this.y += this.velY;
    this.ticksLeft -= 1;
    return this.ticksLeft > 0;
  }
}
