import {
  createPlayerState,
  type CombatStats,
  type Direction,
  type MoveIntent,
  type MovementRules,
  type PlayerInfo,
  type PlayerState,
  type WeaponDefinition,
} from '@thistlevane/shared';

export interface QueuedInput extends MoveIntent {
  seq: number;
  /** World tick the input arrived on. */
  arrivedTick: number;
}

export interface QueuedAttack {
  seq: number;
  aim: Direction;
  arrivedTick: number;
}

/** Server-side player: public info, authoritative movement + combat state, and input bookkeeping. */
export class Player {
  state: PlayerState;
  readonly inputQueue: QueuedInput[] = [];
  /** Highest input seq applied to `state`. Echoed to the client as `ackSeq`. */
  lastAppliedSeq = 0;
  /** Highest input seq accepted into the queue (rejects duplicates / reordering). */
  lastQueuedSeq = 0;
  /** World tick at which the last input arrived. */
  lastInputTick = 0;
  /** True while refilling the jitter buffer after the input stream paused. */
  buffering = true;
  /** Movement budget (anti speed-hack), see network.maxInputCredits. */
  inputCredits: number;
  /** Zone the player is currently in (maintained by WorldManager). */
  zoneId = '';

  /** Combat: attacks have their own, independent monotonic seq (never ride movement's). */
  readonly attackQueue: QueuedAttack[] = [];
  lastQueuedAttackSeq = 0;
  /** World tick of the last resolved attack; gates the next one via weapon.cooldownTicks. */
  lastAttackTick = -Infinity;
  /** Counts down to 0 while dead, then the player is respawned. */
  respawnTicksLeft = 0;

  constructor(
    readonly id: string,
    readonly name: string,
    readonly characterId: string,
    tileX: number,
    tileY: number,
    rules: MovementRules,
    maxInputCredits: number,
    readonly combat: CombatStats,
    readonly weapon: WeaponDefinition,
  ) {
    this.state = createPlayerState(id, tileX, tileY, rules);
    this.state.hp = combat.maxHp;
    this.inputCredits = maxInputCredits;
  }

  /** Teleport (zone transfer or respawn): new position, drop queued inputs/attacks; seq numbering continues. hp carries over (respawn overwrites it after calling this). */
  resetAt(tileX: number, tileY: number, rules: MovementRules): void {
    const { facing, hp } = this.state;
    this.state = { ...createPlayerState(this.id, tileX, tileY, rules), facing, hp };
    this.inputQueue.length = 0;
    this.attackQueue.length = 0;
    this.buffering = true;
  }

  get info(): PlayerInfo {
    return { id: this.id, name: this.name, characterId: this.characterId };
  }
}
