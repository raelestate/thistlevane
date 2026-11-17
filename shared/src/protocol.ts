/**
 * Network protocol. Every message on the wire is one of these JSON shapes.
 * Clients send *intents* only; the server owns all game state.
 */
import type { GameRules } from './config';
import type { Gait } from './content';

export const CARDINAL_DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
export const DIAGONAL_DIRECTIONS = ['up-left', 'up-right', 'down-left', 'down-right'] as const;
export const DIRECTIONS = [...CARDINAL_DIRECTIONS, ...DIAGONAL_DIRECTIONS] as const;
export type Direction = (typeof DIRECTIONS)[number];
export type CardinalDirection = (typeof CARDINAL_DIRECTIONS)[number];

export function isDirection(value: unknown): value is Direction {
  return typeof value === 'string' && (DIRECTIONS as readonly string[]).includes(value);
}

/** Full movement state of one player. Sent in snapshots; used by prediction and interpolation. */
export interface PlayerState {
  id: string;
  /** Tile the player occupies (or is walking into). */
  tileX: number;
  tileY: number;
  /** Tile the current step started from (equals tileX/tileY when standing still). */
  fromX: number;
  fromY: number;
  facing: Direction;
  /** Ticks left in the current step; 0 = standing on tileX/tileY. */
  moveTicksLeft: number;
  /** Total ticks of the current step (depends on gait). */
  stepTicks: number;
  gait: Gait;
  /** Ticks left before a freshly turned player starts walking. */
  turnTicksLeft: number;
  /** Authoritative health. Continuous state, like position — never predicted/rewound client-side. */
  hp: number;
  /** Public level (gates which skills a class has unlocked — see skills.ts). Grid characters (no
   * class/skills) stay at 1. */
  level: number;
}

/** Sent only to the owning connection (never broadcast) — see ConnectionManager. */
export interface PlayerPrivateState {
  xp: number;
  xpForLevel: number;
  /** This class's resource pool (ki/mana/rage/...), 0-100 — see World.ts. Grid characters (no
   * resource) read 0/0. */
  resourceCurrent: number;
  resourceMax: number;
  /** skillId → ms remaining on cooldown. Omitted entries are ready. */
  cooldownsMs: Record<string, number>;
}

export interface PlayerInfo {
  id: string;
  name: string;
  characterId: string;
}

/** A wandering (or fighting) monster as seen by clients. */
export interface MobState {
  id: string;
  kind: string;
  tileX: number;
  tileY: number;
  fromX: number;
  fromY: number;
  facing: Direction;
  moveTicksLeft: number;
  stepTicks: number;
  hp: number;
  /** AI state machine state name (see server/src/world/Mob.ts). Dev/debug display only. */
  aiState: string;
}

/** One tick of player intent. */
export interface MoveIntent {
  dir: Direction | null;
  run: boolean;
}

// ---------- Client → Server ----------

export interface JoinMessage {
  type: 'join';
  name: string;
  characterId?: string;
}

/** One simulation tick of input. `seq` increases by 1 per message so the server can acknowledge it. */
export interface InputMessage extends MoveIntent {
  type: 'input';
  seq: number;
}

/**
 * A basic-attack attempt, aimed independently of movement. Its own monotonic
 * `seq` (separate from InputMessage's) is deduped the same way movement input
 * is — see World.queueAttack. Attacks never need prediction/rewind (one-shot
 * server verdict), so they do not ride InputMessage's reconciliation path.
 */
export interface AttackMessage {
  type: 'attack';
  seq: number;
  aim: Direction;
  /**
   * Optional. When present and it resolves to a live mob/player, the server recomputes `aim`
   * from the real attacker→target vector instead of trusting this field — this is what lets a
   * swing land regardless of which way the attacker happens to be facing/aiming, as long as the
   * target is in range. Omitted = untargeted swing in the claimed `aim` direction, unchanged.
   */
  targetId?: string;
}

/**
 * A skill-cast attempt, keyed by the skill's own id (data/skills.json). Independent `seq`,
 * same dedup/ack pattern as AttackMessage; the server alone decides cooldown/resource/range.
 * `aim` is the snapped Direction (still used server-side for the broadcast facing/animation);
 * `aimDeg` is the real, continuous angle (degrees, 0-360) the client was actually pointed at —
 * skill targeting is free-aim, not grid-snapped, even though movement stays tile-based.
 */
export interface CastMessage {
  type: 'cast';
  seq: number;
  skillId: string;
  aim: Direction;
  aimDeg: number;
  targetId?: string;
}

export type ClientMessage = JoinMessage | InputMessage | AttackMessage | CastMessage;

// ---------- Server → Client ----------

/** Everything a client needs to (re)build the world it is standing in. */
export interface ZoneSnapshot {
  zoneId: string;
  tick: number;
  players: PlayerInfo[];
  states: PlayerState[];
  mobs: MobState[];
}

export interface WelcomeMessage extends ZoneSnapshot {
  type: 'welcome';
  yourId: string;
  rules: GameRules;
  you: PlayerPrivateState;
}

/** The player walked through a portal: same connection, new zone. */
export interface ZoneChangeMessage extends ZoneSnapshot {
  type: 'zoneChange';
  you: PlayerPrivateState;
}

export interface PlayerJoinedMessage {
  type: 'playerJoined';
  player: PlayerInfo;
}

export interface PlayerLeftMessage {
  type: 'playerLeft';
  id: string;
}

/**
 * One-shot combat occurrence, delivered alongside (not interpolated like)
 * continuous state — attacks, hits, deaths, aggro and windups each happen
 * once and must be rendered exactly once, so they ride a discrete event list
 * rather than RemotePlayerBuffer's sample-based interpolation.
 */
export type CombatEventKind = 'attack' | 'cast' | 'hit' | 'heal' | 'death' | 'aggro' | 'windup' | 'projectile';

export interface CombatEvent {
  kind: CombatEventKind;
  /** Attacker (player or mob id). */
  sourceId: string;
  /** Defender, or aggro target. */
  targetId?: string;
  /** Aim direction — 'attack', 'cast', 'windup', 'projectile'. */
  aim?: Direction;
  /** 'cast' only: which skill (data/skills.json id) to look up clip/VFX/icon for. */
  skillId?: string;
  /** 'hit' only. */
  damage?: number;
  /** 'heal' only. */
  healing?: number;
  crit?: boolean;
  /** 'hit'/'heal' only: target's hp after this was applied. */
  hpAfter?: number;
  /** Correlates a 'projectile' spawn with its later resolving 'hit' (or silent expiry). */
  projectileId?: string;
  projectile?: {
    fromX: number;
    fromY: number;
    dirX: number;
    dirY: number;
    speedTilesPerSec: number;
    rangeTiles: number;
  };
}

/** Authoritative state of everything near this client (area of interest), every tick. */
export interface SnapshotMessage {
  type: 'snapshot';
  tick: number;
  /** Highest input `seq` from *this* client that the server has applied. */
  ackSeq: number;
  players: PlayerState[];
  mobs: MobState[];
  events: CombatEvent[];
  you: PlayerPrivateState;
}

export interface ErrorMessage {
  type: 'error';
  reason: string;
}

export type ServerMessage =
  | WelcomeMessage
  | ZoneChangeMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | SnapshotMessage
  | ErrorMessage;

// ---------- Validation ----------

/**
 * Parse and validate an untrusted client message.
 * Returns null for anything malformed; the server simply ignores those.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const msg = data as Record<string, unknown>;

  switch (msg.type) {
    case 'join':
      if (typeof msg.name !== 'string') return null;
      if (msg.characterId !== undefined && typeof msg.characterId !== 'string') return null;
      return { type: 'join', name: msg.name, characterId: msg.characterId as string | undefined };
    case 'input':
      if (!Number.isSafeInteger(msg.seq) || (msg.seq as number) < 0) return null;
      if (msg.dir !== null && !isDirection(msg.dir)) return null;
      if (msg.run !== undefined && typeof msg.run !== 'boolean') return null;
      return { type: 'input', seq: msg.seq as number, dir: msg.dir as Direction | null, run: msg.run === true };
    case 'attack':
      if (!Number.isSafeInteger(msg.seq) || (msg.seq as number) < 0) return null;
      if (!isDirection(msg.aim)) return null;
      if (msg.targetId !== undefined && typeof msg.targetId !== 'string') return null;
      return { type: 'attack', seq: msg.seq as number, aim: msg.aim, targetId: msg.targetId as string | undefined };
    case 'cast':
      if (!Number.isSafeInteger(msg.seq) || (msg.seq as number) < 0) return null;
      if (typeof msg.skillId !== 'string' || !msg.skillId) return null;
      if (!isDirection(msg.aim)) return null;
      if (typeof msg.aimDeg !== 'number' || !Number.isFinite(msg.aimDeg)) return null;
      if (msg.targetId !== undefined && typeof msg.targetId !== 'string') return null;
      return {
        type: 'cast', seq: msg.seq as number, skillId: msg.skillId, aim: msg.aim,
        aimDeg: msg.aimDeg, targetId: msg.targetId as string | undefined,
      };
    default:
      return null;
  }
}

/** Keep names short and printable: letters, digits, space, underscore, hyphen. */
export function sanitizeName(raw: string, maxLength: number, fallback: string): string {
  const cleaned = raw
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
  return cleaned.length > 0 ? cleaned : fallback;
}
