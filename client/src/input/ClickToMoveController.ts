import { findPath, type Direction, type Walkability } from '@thistlevane/shared';

/** Ticks of standing fully still (not mid-step) with a path still queued before concluding the
 * route is genuinely blocked (not just paused by a turn delay) and asking for a replan. */
const STALL_TICKS_BEFORE_REPLAN = 10;

/** Who asked for the active path: a deliberate click always wins and is never overridden by
 * hover-to-attack's own auto-approach; auto-approach only ever starts or continues a path it
 * owns itself. */
export type MoveOwner = 'player' | 'auto';

/**
 * Turns a clicked destination tile into the same kind of per-tile `Direction` intent keyboard
 * input already produces — `WorldScene` feeds whichever one is active into the existing
 * `LocalPlayerPredictor`/server protocol unchanged, so no movement-authority code needs to know
 * or care where an intent came from.
 *
 * `currentDirection` is a peek, not a pop: like a held key, it returns the same direction every
 * tick until `afterTick` observes that step has actually landed (stepMovement itself only
 * re-reads the intended direction once a step completes — mid-step ticks ignore it entirely —
 * so popping eagerly would desync the queue from the character's real position).
 */
export class ClickToMoveController {
  private path: Direction[] = [];
  private destination: { x: number; y: number } | null = null;
  private owner: MoveOwner = 'player';
  private lastTile: { x: number; y: number } | null = null;
  private stalledTicks = 0;
  private replansLeft = 0;

  get isActive(): boolean {
    return this.destination !== null;
  }

  get destinationTile(): { x: number; y: number } | null {
    return this.destination;
  }

  get currentOwner(): MoveOwner | null {
    return this.destination ? this.owner : null;
  }

  get currentDirection(): Direction | null {
    return this.path[0] ?? null;
  }

  /**
   * Plans a route from `from` to `to` over `world` and replaces whatever path was active — a
   * fresh click (or a replan) always wins. Returns false, and clears the controller, if `to` is
   * unreachable or already reached.
   */
  moveTo(from: { x: number; y: number }, to: { x: number; y: number }, world: Walkability, owner: MoveOwner = 'player'): boolean {
    if (from.x === to.x && from.y === to.y) {
      this.clear();
      return false;
    }
    const path = findPath(from, to, world);
    if (!path || path.length === 0) {
      this.clear();
      return false;
    }
    this.path = path;
    this.destination = to;
    this.owner = owner;
    this.lastTile = { ...from };
    this.stalledTicks = 0;
    this.replansLeft = 1;
    return true;
  }

  clear(): void {
    this.path = [];
    this.destination = null;
    this.lastTile = null;
    this.stalledTicks = 0;
    this.replansLeft = 0;
  }

  /**
   * Call once per local simulation tick, after the predictor has applied this tick's intent,
   * with the player's resulting integer tile and `moveTicksLeft`. Advances past a step the
   * moment its tile is reached; detects a stall (standing fully still, path still queued —
   * something now blocks the planned route) and returns true, at most once per `moveTo`, asking
   * the caller to replan with fresh obstacle data. After that one retry it gives up on its own.
   */
  afterTick(tileX: number, tileY: number, moveTicksLeft: number): boolean {
    if (!this.destination) return false;

    const moved = !this.lastTile || tileX !== this.lastTile.x || tileY !== this.lastTile.y;
    this.lastTile = { x: tileX, y: tileY };
    if (moved) {
      this.path.shift();
      this.stalledTicks = 0;
    }
    if (this.path.length === 0 || (tileX === this.destination.x && tileY === this.destination.y)) {
      this.clear();
      return false;
    }

    if (moveTicksLeft > 0) {
      this.stalledTicks = 0; // mid-step: definitely not stalled
      return false;
    }
    this.stalledTicks += 1;
    if (this.stalledTicks <= STALL_TICKS_BEFORE_REPLAN) return false;
    this.stalledTicks = 0;
    if (this.replansLeft <= 0) {
      this.clear();
      return false;
    }
    this.replansLeft -= 1;
    return true;
  }
}
