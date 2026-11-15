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
}

export interface PlayerInfo {
  id: string;
  name: string;
  characterId: string;
}

/** A wandering monster as seen by clients (no combat yet). */
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

export type ClientMessage = JoinMessage | InputMessage;

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
}

/** The player walked through a portal: same connection, new zone. */
export interface ZoneChangeMessage extends ZoneSnapshot {
  type: 'zoneChange';
}

export interface PlayerJoinedMessage {
  type: 'playerJoined';
  player: PlayerInfo;
}

export interface PlayerLeftMessage {
  type: 'playerLeft';
  id: string;
}

/** Authoritative state of everything near this client (area of interest), every tick. */
export interface SnapshotMessage {
  type: 'snapshot';
  tick: number;
  /** Highest input `seq` from *this* client that the server has applied. */
  ackSeq: number;
  players: PlayerState[];
  mobs: MobState[];
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
