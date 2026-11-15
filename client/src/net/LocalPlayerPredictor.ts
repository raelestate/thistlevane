import {
  PlayerAwareWalkability,
  clonePlayerState,
  isMoving,
  sameMovementState,
  stepMovement,
  tilePosition,
  type InputMessage,
  type MoveIntent,
  type MovementRules,
  type PlayerState,
  type StepOutcome,
  type Walkability,
} from '@thistlevane/shared';

/**
 * Client-side prediction for the local player.
 *
 * Every local tick we apply the held intent immediately (so controls feel
 * instant), send it to the server with a sequence number, and remember it.
 * When a snapshot arrives we restart from the server's authoritative state and
 * re-apply the inputs the server has not processed yet. Both sides run the
 * identical `stepMovement`, so this normally reproduces the prediction exactly;
 * if it doesn't (e.g. another player got to a tile first) the server wins.
 */
export class LocalPlayerPredictor {
  current: PlayerState;
  previous: PlayerState;
  corrections = 0;

  private seq = 0;
  private pending: Array<{ seq: number } & MoveIntent> = [];
  /** Latest authoritative positions of everyone else (they block us). */
  private others: PlayerState[] = [];
  private readonly world: Walkability;

  constructor(
    initial: PlayerState,
    map: Walkability,
    private readonly rules: MovementRules,
    private readonly sendInput: (msg: InputMessage) => void,
  ) {
    this.current = clonePlayerState(initial);
    this.previous = clonePlayerState(initial);
    this.world = new PlayerAwareWalkability(map, () => this.others, initial.id, rules);
  }

  /** Run one fixed simulation tick with the current intent. */
  tick(intent: MoveIntent): StepOutcome {
    this.previous = clonePlayerState(this.current);
    // Standing still with nothing held: nothing to simulate or send.
    if (intent.dir === null && !isMoving(this.current) && this.current.turnTicksLeft === 0) return { kind: 'none' };

    this.seq += 1;
    this.sendInput({ type: 'input', seq: this.seq, dir: intent.dir, run: intent.run });
    this.pending.push({ seq: this.seq, dir: intent.dir, run: intent.run });
    return stepMovement(this.current, intent, this.world, this.rules);
  }

  /** Apply an authoritative server state for this player, plus everyone else's for collision. */
  reconcile(serverState: PlayerState, ackSeq: number, others: PlayerState[]): void {
    this.others = others;
    this.pending = this.pending.filter((input) => input.seq > ackSeq);
    const corrected = clonePlayerState(serverState);
    for (const input of this.pending) stepMovement(corrected, input, this.world, this.rules);

    if (!sameMovementState(corrected, this.current)) {
      this.corrections += 1;
      this.current = corrected;
    }
  }

  /** Position in tile units blended between the last two ticks; `alpha` in [0, 1]. */
  renderPosition(alpha: number): { x: number; y: number } {
    const a = tilePosition(this.previous);
    const b = tilePosition(this.current);
    return { x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha };
  }

  get pendingCount(): number {
    return this.pending.length;
  }
}
