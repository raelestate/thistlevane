import {
  CARDINAL_DIRECTIONS,
  DIRECTION_DELTAS,
  stepMovement,
  type CardinalDirection,
  type MobDefinition,
  type MobState,
  type MovementRules,
  type PlayerState,
  type TileRect,
  type Walkability,
} from '@thistlevane/shared';

/**
 * A wandering monster. Movement reuses the shared grid rules (so mobs respect
 * cliffs, ramps and blocking exactly like players). No combat yet.
 */
export class Mob {
  /** Movement state in the same shape as a player's, so stepMovement can drive it. */
  readonly state: PlayerState;
  private pauseTicks: number;
  private stepsLeft = 0;
  private dir: CardinalDirection = 'down';

  constructor(
    readonly id: string,
    /** Key of this mob in mobs.json. */
    readonly kind: string,
    readonly def: MobDefinition,
    readonly home: TileRect,
    tileX: number,
    tileY: number,
    private readonly random: () => number,
  ) {
    this.state = {
      id, tileX, tileY, fromX: tileX, fromY: tileY, facing: 'down',
      moveTicksLeft: 0, stepTicks: def.walkTicksPerTile, gait: 'walk', turnTicksLeft: 0,
    };
    this.pauseTicks = this.randomPause();
  }

  /** Movement rules for this mob: its own speed, no turn delay, blocks others. */
  get rules(): MovementRules {
    return { walkTicksPerTile: this.def.walkTicksPerTile, runTicksPerTile: this.def.walkTicksPerTile, turnDelayTicks: 0, playersBlockEachOther: true };
  }

  tick(world: Walkability): void {
    const s = this.state;
    if (s.moveTicksLeft > 0) {
      // Mid-step: finish it, chaining straight into the next step while the walk continues inside home.
      const next = this.ahead(s.tileX, s.tileY);
      const wantMore = this.stepsLeft > 0 && this.inHome(next.x, next.y);
      const outcome = stepMovement(s, { dir: wantMore ? this.dir : null, run: false }, world, this.rules);
      if (outcome.kind === 'started') this.stepsLeft -= 1;
      else if (s.moveTicksLeft === 0) {
        // arrived and did not continue (walk over, left home, or blocked): rest a while
        this.stepsLeft = 0;
        this.pauseTicks = this.randomPause();
      }
      return;
    }
    if (this.pauseTicks > 0) {
      this.pauseTicks -= 1;
      return;
    }
    if (this.stepsLeft <= 0) this.chooseWander();
    const target = this.ahead(s.tileX, s.tileY);
    if (!this.inHome(target.x, target.y)) {
      this.stepsLeft = 0;
      this.pauseTicks = Math.max(3, this.randomPause() >> 2);
      return;
    }
    const outcome = stepMovement(s, { dir: this.dir, run: false }, world, this.rules);
    if (outcome.kind === 'started') this.stepsLeft -= 1;
    else {
      this.stepsLeft = 0;
      this.pauseTicks = Math.max(5, this.randomPause() >> 1);
    }
  }

  snapshot(): MobState {
    const s = this.state;
    return { id: this.id, kind: this.kind, tileX: s.tileX, tileY: s.tileY, fromX: s.fromX, fromY: s.fromY, facing: s.facing, moveTicksLeft: s.moveTicksLeft, stepTicks: s.stepTicks };
  }

  private chooseWander(): void {
    this.dir = CARDINAL_DIRECTIONS[Math.floor(this.random() * CARDINAL_DIRECTIONS.length)]!;
    this.stepsLeft = 1 + Math.floor(this.random() * this.def.wander.maxSteps);
  }

  private ahead(x: number, y: number): { x: number; y: number } {
    const d = DIRECTION_DELTAS[this.dir];
    return { x: x + d.dx, y: y + d.dy };
  }

  private inHome(x: number, y: number): boolean {
    return x >= this.home.x && x < this.home.x + this.home.w && y >= this.home.y && y < this.home.y + this.home.h;
  }

  private randomPause(): number {
    const { pauseTicksMin, pauseTicksMax } = this.def.wander;
    return pauseTicksMin + Math.floor(this.random() * (pauseTicksMax - pauseTicksMin + 1));
  }
}
