/**
 * Combat math shared by player attacks and mob attacks: one geometry/damage
 * implementation, dispatched identically regardless of who is attacking whom.
 * Pure functions only — no server/client/network concerns here.
 */
import { DIRECTIONS, type Direction } from './protocol';
import { DIRECTION_DELTAS, type Walkability } from './movement';

export interface WeaponDefinition {
  kind: 'melee' | 'ranged';
  /** Melee reach, or ranged max travel distance, in tiles. */
  rangeTiles: number;
  /** Full angle (degrees) of the melee hit cone; ignored for ranged weapons. */
  arcDegrees: number;
  cooldownTicks: number;
  /** Ranged only: how fast the projectile crosses tiles. */
  projectileSpeedTilesPerSec?: number;
}

export const DEFAULT_WEAPON: WeaponDefinition = {
  kind: 'melee',
  rangeTiles: 1.4,
  arcDegrees: 90,
  cooldownTicks: 14,
};

export interface AggroConfig {
  detectionRangeTiles: number;
  /** Chebyshev distance from the mob's home-region centre a chase may travel before it must return. */
  leashRangeTiles: number;
  /** Telegraph timer before an attack lands; damage ties to this, never to animation start. */
  attackWindupTicks: number;
  respawnTicks: number;
}

export const DEFAULT_AGGRO: AggroConfig = {
  detectionRangeTiles: 5,
  leashRangeTiles: 7,
  attackWindupTicks: 12,
  respawnTicks: 100,
};

export function getWeapon(def: { weapon?: WeaponDefinition }): WeaponDefinition {
  return def.weapon ?? DEFAULT_WEAPON;
}

export function getAggro(def: { aggro?: AggroConfig }): AggroConfig {
  return def.aggro ?? DEFAULT_AGGRO;
}

function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function angleDifference(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function angleOfVector(dx: number, dy: number): number {
  return normalizeDegrees((Math.atan2(dy, dx) * 180) / Math.PI);
}

const DIRECTION_ANGLES: Record<Direction, number> = Object.fromEntries(
  DIRECTIONS.map((d) => [d, angleOfVector(DIRECTION_DELTAS[d].dx, DIRECTION_DELTAS[d].dy)]),
) as Record<Direction, number>;

/** Snaps a screen/world-space vector to the nearest of the 8 grid directions (±22.5° sectors). */
export function snapAngleToDirection(dx: number, dy: number): Direction {
  if (dx === 0 && dy === 0) return 'down';
  const angle = angleOfVector(dx, dy);
  let best: Direction = 'down';
  let bestDiff = Infinity;
  for (const dir of DIRECTIONS) {
    const diff = angleDifference(angle, DIRECTION_ANGLES[dir]);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = dir;
    }
  }
  return best;
}

/**
 * Does a melee swing aimed at `aim` from `attacker` reach `target`? Works in
 * continuous tile-space (not tile enumeration): a distance check against
 * `weapon.rangeTiles`, an angle check against `weapon.arcDegrees`, and a
 * line-of-sight check so a swing can't reach through a wall. `world` is
 * required (not optional) so a call site can't forget the wall check.
 */
export function meleeHitTest(
  attacker: { x: number; y: number },
  aim: Direction,
  target: { x: number; y: number },
  weapon: WeaponDefinition,
  world: Walkability,
): boolean {
  const dx = target.x - attacker.x;
  const dy = target.y - attacker.y;
  const distance = Math.hypot(dx, dy);
  if (distance > weapon.rangeTiles) return false;
  if (distance < 1e-6) return true; // standing on the attacker's own spot: never out of arc
  const diff = angleDifference(angleOfVector(dx, dy), DIRECTION_ANGLES[aim]);
  if (diff > weapon.arcDegrees / 2) return false;
  return hasLineOfSight(attacker, target, world);
}

/**
 * Is `to` visible from `from` on the grid — i.e. does a straight line between
 * them cross any non-walkable tile? Samples the segment at sub-tile
 * resolution; the map's own elevation rule (ramps vs. cliffs) is honoured by
 * passing each step's previous sample as `isWalkable`'s `from`.
 */
export function hasLineOfSight(from: { x: number; y: number }, to: { x: number; y: number }, world: Walkability): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(distance * 4)); // sample roughly every quarter tile
  let prevX = Math.round(from.x);
  let prevY = Math.round(from.y);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(from.x + dx * t);
    const y = Math.round(from.y + dy * t);
    if ((x !== prevX || y !== prevY) && !world.isWalkable(x, y, prevX, prevY)) return false;
    prevX = x;
    prevY = y;
  }
  return true;
}

/** Ports CombatPreview's existing, already-tuned formula verbatim so damage numbers don't change. */
export function resolveDamage(
  attack: number,
  defense: number,
  random: () => number = Math.random,
): { damage: number; crit: boolean } {
  const roll = 0.85 + random() * 0.3;
  const crit = random() < 0.12;
  const raw = attack * roll * (crit ? 1.8 : 1) - defense * 0.5;
  const damage = Math.max(1, Math.round(raw));
  return { damage, crit };
}
