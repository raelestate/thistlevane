/**
 * Maps server ticks onto the local clock so remote players can be rendered at
 * a consistent point in the past.
 *
 * offset ≈ (local arrival time) − (server time of that tick). We track the
 * smallest offset seen (the least-delayed packet), relaxing slowly upward so
 * the estimate follows clock drift and genuine latency increases.
 */
export class ServerClock {
  private offset: number | null = null;
  private static readonly RELAX = 0.02;

  constructor(private readonly tickMs: number) {}

  observe(tick: number, localNow = performance.now()): void {
    const sample = localNow - tick * this.tickMs;
    if (this.offset === null || sample < this.offset) this.offset = sample;
    else this.offset += (sample - this.offset) * ServerClock.RELAX;
  }

  /** Estimated current server time in ms, or null before the first snapshot. */
  serverNow(localNow = performance.now()): number | null {
    return this.offset === null ? null : localNow - this.offset;
  }

  serverTimeOfTick(tick: number): number {
    return tick * this.tickMs;
  }
}
