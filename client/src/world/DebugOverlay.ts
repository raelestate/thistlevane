import * as Phaser from 'phaser';
import { DIRECTION_DELTAS, type Direction, type WeaponDefinition } from '@thistlevane/shared';

export interface DebugMobInfo {
  id: string;
  x: number;
  y: number;
  detectionRangeTiles: number;
  leashRangeTiles: number;
  aiState: string;
}

/**
 * Dev-only combat visualization: the local player's weapon range/arc along
 * the current aim direction, and every visible mob's detection/leash radius
 * and current AI state. Gated behind import.meta.env.DEV by the caller —
 * per-frame shape redraws are the part worth stripping from a real build.
 */
export class DebugOverlay {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly labels = new Map<string, Phaser.GameObjects.Text>();

  constructor(private readonly scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(2_000_000);
  }

  draw(input: {
    player: { x: number; y: number; aim: Direction; weapon: WeaponDefinition };
    mobs: DebugMobInfo[];
    tileSize: { width: number; height: number };
  }): void {
    const g = this.graphics;
    g.clear();
    const toPx = (x: number, y: number): [number, number] => [(x + 0.5) * input.tileSize.width, (y + 1) * input.tileSize.height];

    const [px, py] = toPx(input.player.x, input.player.y);
    const delta = DIRECTION_DELTAS[input.player.aim];
    const aimRad = Math.atan2(delta.dy, delta.dx);
    const halfArc = ((input.player.weapon.arcDegrees / 2) * Math.PI) / 180;
    const range = input.player.weapon.rangeTiles * input.tileSize.width;
    g.lineStyle(1, 0x80ffcc, 0.8);
    g.beginPath();
    g.moveTo(px, py);
    g.arc(px, py, range, aimRad - halfArc, aimRad + halfArc, false);
    g.closePath();
    g.strokePath();

    const seen = new Set<string>();
    for (const mob of input.mobs) {
      seen.add(mob.id);
      const [mx, my] = toPx(mob.x, mob.y);
      g.lineStyle(1, 0xffaa66, 0.5);
      g.strokeCircle(mx, my, mob.detectionRangeTiles * input.tileSize.width);
      g.lineStyle(1, 0xff5566, 0.4);
      g.strokeCircle(mx, my, mob.leashRangeTiles * input.tileSize.width);
      this.labelFor(mob.id).setPosition(mx, my - 12).setText(mob.aiState).setVisible(true);
    }
    for (const [id, label] of this.labels) {
      if (!seen.has(id)) label.setVisible(false);
    }
  }

  destroy(): void {
    this.graphics.destroy();
    for (const label of this.labels.values()) label.destroy();
    this.labels.clear();
  }

  private labelFor(id: string): Phaser.GameObjects.Text {
    let label = this.labels.get(id);
    if (!label) {
      label = this.scene.add
        .text(0, 0, '', { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '8px', color: '#ffe080' })
        .setOrigin(0.5, 1)
        .setDepth(2_000_001);
      this.labels.set(id, label);
    }
    return label;
  }
}
