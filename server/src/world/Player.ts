import { createPlayerState, type MoveIntent, type MovementRules, type PlayerInfo, type PlayerState } from '@thistlevane/shared';

export interface QueuedInput extends MoveIntent {
  seq: number;
  /** World tick the input arrived on. */
  arrivedTick: number;
}

/** Server-side player: public info, authoritative movement state, and input bookkeeping. */
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

  constructor(
    readonly id: string,
    readonly name: string,
    readonly characterId: string,
    tileX: number,
    tileY: number,
    rules: MovementRules,
    maxInputCredits: number,
  ) {
    this.state = createPlayerState(id, tileX, tileY, rules);
    this.inputCredits = maxInputCredits;
  }

  /** Teleport (zone transfer): new position, drop queued inputs; seq numbering continues. */
  resetAt(tileX: number, tileY: number, rules: MovementRules): void {
    const facing = this.state.facing;
    this.state = { ...createPlayerState(this.id, tileX, tileY, rules), facing };
    this.inputQueue.length = 0;
    this.buffering = true;
  }

  get info(): PlayerInfo {
    return { id: this.id, name: this.name, characterId: this.characterId };
  }
}
