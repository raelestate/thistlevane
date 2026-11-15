/**
 * Fixed-timestep loop. Uses an accumulator against a monotonic clock so the
 * simulation runs at exactly `tickMs` on average even though timers fire late,
 * and catches up (bounded) after a stall instead of drifting.
 */
export class GameLoop {
  private timer: NodeJS.Timeout | null = null;
  private lastTime = 0;
  private accumulator = 0;
  private static readonly MAX_CATCH_UP_TICKS = 5;

  constructor(
    private readonly tickMs: number,
    private readonly onTick: () => void,
  ) {}

  start(): void {
    if (this.timer) return;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.schedule();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    const delay = Math.max(0, this.tickMs - this.accumulator);
    this.timer = setTimeout(() => this.run(), delay);
  }

  private run(): void {
    const now = performance.now();
    this.accumulator += now - this.lastTime;
    this.lastTime = now;

    let ticks = 0;
    while (this.accumulator >= this.tickMs && ticks < GameLoop.MAX_CATCH_UP_TICKS) {
      this.accumulator -= this.tickMs;
      ticks += 1;
      try {
        this.onTick();
      } catch (err) {
        console.error('[loop] tick failed:', err);
      }
    }
    if (ticks === GameLoop.MAX_CATCH_UP_TICKS && this.accumulator >= this.tickMs) {
      console.warn(`[loop] server fell behind by ${Math.round(this.accumulator)}ms; dropping time`);
      this.accumulator = 0;
    }
    if (this.timer) this.schedule();
  }
}
