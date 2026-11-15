/** Minimal timestamped logger. Replaced by structured logging in Milestone 9. */
export function log(scope: string, message: string): void {
  if (process.env.THISTLEVANE_QUIET) return;
  console.log(`${new Date().toISOString()} [${scope}] ${message}`);
}
