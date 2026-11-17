/**
 * Single source of truth for "what is the player's current combat target": an explicit click
 * (`lock`) takes precedence and persists through the pointer leaving, Esc, or cycling to
 * another target; a bare hover is secondary and clears the moment the pointer leaves that
 * sprite. Hover-to-attack and the HUD/target-ring both just read `effectiveTargetId` — this
 * class only tracks ids, it knows nothing about Phaser, positions or the network.
 */
export class TargetingController {
  private lockedId: string | null = null;
  private hoveredId: string | null = null;

  get effectiveTargetId(): string | null {
    return this.lockedId ?? this.hoveredId;
  }

  get hoveredTargetId(): string | null {
    return this.hoveredId;
  }

  lock(id: string | null): void {
    this.lockedId = id;
  }

  setHover(id: string | null): void {
    this.hoveredId = id;
  }

  /** Call when an id leaves the world (dies and hides, or walks out of interest range) so a
   * stale lock/hover can never linger on something that no longer exists. */
  forget(id: string): void {
    if (this.lockedId === id) this.lockedId = null;
    if (this.hoveredId === id) this.hoveredId = null;
  }

  clear(): void {
    this.lockedId = null;
    this.hoveredId = null;
  }
}
