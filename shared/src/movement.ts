/**
 * Grid movement rules. This exact code runs on the server (authoritative)
 * and on the client (prediction), so both always agree given the same inputs.
 * All tuning comes from MovementRules (assets/data/game-config.json).
 */
import type { MovementRules } from './config';
import type { Direction, MoveIntent, PlayerState } from './protocol';

export interface Walkability {
  /** Can something stand on the tile? `from` lets the map apply the elevation rule (cliffs vs ramps). */
  isWalkable(tileX: number, tileY: number, fromX?: number, fromY?: number): boolean;
}

export const DIRECTION_DELTAS: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
  'up-left': { dx: -1, dy: -1 },
  'up-right': { dx: 1, dy: -1 },
  'down-left': { dx: -1, dy: 1 },
  'down-right': { dx: 1, dy: 1 },
};

/** What happened this tick; the client uses it for cosmetic effects (dust, bumps). */
export type StepOutcome =
  | { kind: 'none' }
  | { kind: 'turned' }
  | { kind: 'started'; fromX: number; fromY: number }
  | { kind: 'blocked'; tileX: number; tileY: number };

const NONE: StepOutcome = { kind: 'none' };

export function createPlayerState(id: string, tileX: number, tileY: number, rules: MovementRules): PlayerState {
  return {
    id, tileX, tileY, fromX: tileX, fromY: tileY, facing: 'down',
    moveTicksLeft: 0, stepTicks: rules.walkTicksPerTile, gait: 'walk', turnTicksLeft: 0,
    hp: 0, // placeholder — the caller (Player/Mob) overwrites with the real maxHp immediately
  };
}

/** Advance one player's movement by exactly one tick. Mutates `state`. */
export function stepMovement(
  state: PlayerState,
  intent: MoveIntent,
  world: Walkability,
  rules: MovementRules,
): StepOutcome {
  let arrivedThisTick = false;
  if (state.moveTicksLeft > 0) {
    state.moveTicksLeft -= 1;
    if (state.moveTicksLeft > 0) return NONE;
    // Arrived on the tile; fall through so a held key chains straight into the next step.
    state.fromX = state.tileX;
    state.fromY = state.tileY;
    arrivedThisTick = true;
  }

  const dir = intent.dir;
  if (dir === null) {
    state.turnTicksLeft = 0;
    return NONE;
  }

  // From a standstill, a new direction first turns the character in place;
  // a tap turns without stepping, holding walks after a short beat.
  if (!arrivedThisTick && dir !== state.facing) {
    state.facing = dir;
    state.turnTicksLeft = rules.turnDelayTicks;
    if (state.turnTicksLeft > 0) return { kind: 'turned' };
  } else if (state.turnTicksLeft > 0) {
    state.turnTicksLeft -= 1;
    if (state.turnTicksLeft > 0) return NONE;
  }

  state.facing = dir;
  const { dx, dy } = DIRECTION_DELTAS[dir];
  const targetX = state.tileX + dx;
  const targetY = state.tileY + dy;
  if (!world.isWalkable(targetX, targetY, state.tileX, state.tileY)) return { kind: 'blocked', tileX: targetX, tileY: targetY };

  const fromX = state.tileX;
  const fromY = state.tileY;
  state.fromX = fromX;
  state.fromY = fromY;
  state.tileX = targetX;
  state.tileY = targetY;
  state.gait = intent.run ? 'run' : 'walk';
  state.stepTicks = intent.run ? rules.runTicksPerTile : rules.walkTicksPerTile;
  state.moveTicksLeft = state.stepTicks;
  return { kind: 'started', fromX, fromY };
}

/** Anything that moves on the grid and can block a tile (players, mobs). */
export type Mover = Pick<PlayerState, 'id' | 'tileX' | 'tileY' | 'fromX' | 'fromY' | 'moveTicksLeft'>;

/** Does this mover currently block the given tile? A walking entity holds both ends of its step. */
export function occupiesTile(state: Mover, tileX: number, tileY: number): boolean {
  if (state.tileX === tileX && state.tileY === tileY) return true;
  return state.moveTicksLeft > 0 && state.fromX === tileX && state.fromY === tileY;
}

/**
 * Map walkability plus other movers (players, mobs) as obstacles when the rules say so.
 * `others` is read lazily so the server always sees positions updated earlier in the same tick.
 */
export class PlayerAwareWalkability implements Walkability {
  constructor(
    private readonly map: Walkability,
    private readonly others: () => Iterable<Mover>,
    private readonly selfId: string,
    private readonly rules: MovementRules,
  ) {}

  isWalkable(tileX: number, tileY: number, fromX?: number, fromY?: number): boolean {
    if (!this.map.isWalkable(tileX, tileY, fromX, fromY)) return false;
    if (!this.rules.playersBlockEachOther) return true;
    for (const other of this.others()) {
      if (other.id !== this.selfId && occupiesTile(other, tileX, tileY)) return false;
    }
    return true;
  }
}

/** Position in tile units (fractional mid-step) — multiply by the map's tile size to render. */
export function tilePosition(state: PlayerState): { x: number; y: number } {
  const t = state.stepTicks > 0 ? 1 - state.moveTicksLeft / state.stepTicks : 1;
  return {
    x: state.fromX + (state.tileX - state.fromX) * t,
    y: state.fromY + (state.tileY - state.fromY) * t,
  };
}

export function isMoving(state: PlayerState): boolean {
  return state.moveTicksLeft > 0;
}

export function clonePlayerState(state: PlayerState): PlayerState {
  return { ...state };
}

export function sameMovementState(a: PlayerState, b: PlayerState): boolean {
  return (
    a.tileX === b.tileX &&
    a.tileY === b.tileY &&
    a.fromX === b.fromX &&
    a.fromY === b.fromY &&
    a.facing === b.facing &&
    a.moveTicksLeft === b.moveTicksLeft &&
    a.stepTicks === b.stepTicks &&
    a.gait === b.gait &&
    a.turnTicksLeft === b.turnTicksLeft
  );
}
