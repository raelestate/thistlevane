import * as Phaser from 'phaser';

export type CombatTextKind = 'damage' | 'heal' | 'miss' | 'crit' | 'xp';

const STYLE: Record<CombatTextKind, { color: string; size: number; rise: number }> = {
  damage: { color: '#ffd0c0', size: 8, rise: 18 },
  crit: { color: '#ffd040', size: 11, rise: 24 },
  heal: { color: '#8ce860', size: 8, rise: 18 },
  miss: { color: '#a0a0a0', size: 7, rise: 14 },
  xp: { color: '#c8a050', size: 7, rise: 22 },
};

const DURATION_MS = 850;

/** Floating combat numbers: the readable half of "did that hit?". */
export class CombatTextManager {
  constructor(private scene: Phaser.Scene) {}

  spawn(worldX: number, worldY: number, value: string, kind: CombatTextKind = 'damage'): void {
    const s = STYLE[kind];
    // Nudge each number sideways so a fast series does not stack into a blur.
    const jitter = Phaser.Math.Between(-4, 4);
    const text = this.scene.add.text(worldX + jitter, worldY, value, {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: `${s.size}px`,
      color: s.color,
      stroke: '#1a1020',
      strokeThickness: 3,
    });
    text.setOrigin(0.5, 1).setDepth(99999).setResolution(2);

    if (kind === 'crit') {
      text.setScale(0.6);
      this.scene.tweens.add({ targets: text, scale: 1, duration: 140, ease: 'Back.easeOut' });
    }
    this.scene.tweens.add({
      targets: text,
      y: worldY - s.rise,
      alpha: { from: 1, to: 0 },
      duration: DURATION_MS,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }
}
