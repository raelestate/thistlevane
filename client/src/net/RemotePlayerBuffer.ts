import { tilePosition, type Direction, type Gait, type PlayerState } from '@thistlevane/shared';

interface Sample {
  time: number; // server time in ms
  x: number; // tile units
  y: number;
  facing: Direction;
  gait: Gait;
  /** Server says a step is in progress (stays true even if a snapshot repeats a position). */
  stepping: boolean;
}

export interface InterpolatedPose {
  x: number;
  y: number;
  facing: Direction;
  moving: boolean;
  gait: Gait;
}

/**
 * Snapshot history for one remote player. Rendering happens slightly in the
 * past (client.interpolationDelayMs) so we can blend smoothly between two
 * known server states instead of guessing the future.
 */
export class RemotePlayerBuffer {
  private samples: Sample[] = [];
  private lastMoving = false;

  push(serverTime: number, state: PlayerState): void {
    const last = this.samples[this.samples.length - 1];
    if (last && serverTime <= last.time) return; // stale or duplicate
    const { x, y } = tilePosition(state);
    this.samples.push({ time: serverTime, x, y, facing: state.facing, gait: state.gait, stepping: state.moveTicksLeft > 0 });
  }

  sample(renderTime: number): InterpolatedPose | null {
    const samples = this.samples;
    if (samples.length === 0) return null;

    // Drop history we will never need again (keep one sample before renderTime).
    while (samples.length > 2 && samples[1]!.time <= renderTime) samples.shift();

    const a = samples[0]!;
    const b = samples[1];
    if (!b || renderTime <= a.time) return { x: a.x, y: a.y, facing: a.facing, moving: false, gait: a.gait };
    if (renderTime >= b.time) {
      // Ran out of data (packet late): hold the newest position and keep the last animation
      // so a tiny hiccup doesn't flash the idle pose.
      const newest = samples[samples.length - 1]!;
      return { x: newest.x, y: newest.y, facing: newest.facing, moving: this.lastMoving, gait: newest.gait };
    }
    const t = (renderTime - a.time) / (b.time - a.time);
    this.lastMoving = a.stepping || b.stepping || a.x !== b.x || a.y !== b.y;
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      facing: b.facing,
      moving: this.lastMoving,
      gait: b.gait,
    };
  }
}
