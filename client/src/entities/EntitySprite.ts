import * as Phaser from 'phaser';
import type { Direction, Gait, GameConfig } from '@thistlevane/shared';
import { keys, type SpriteRef } from '../content/ContentLoader';

export interface TileSize {
  width: number;
  height: number;
}

/**
 * Visual representation of any grid entity (player or mob), driven entirely by its
 * SpriteDefinition. Knows nothing about networking: callers give it a position
 * (tile units), facing, moving flag and gait every frame.
 */
export class EntitySprite {
  readonly sprite: Phaser.GameObjects.Sprite;
  /** Rounded tile the entity visually stands on; changes mid-step. */
  visualTile: { x: number; y: number } | null = null;
  /** Called when the entity visually crosses into a new tile while moving. */
  onEnterTile: (tile: { x: number; y: number }, from: { x: number; y: number }, gait: Gait) => void = () => {};

  /** DEBUG name label; proper nameplates arrive with the character UI work. */
  private readonly label: Phaser.GameObjects.Text | null;
  private readonly labelOffsetY: number;
  private currentKey = '';

  constructor(
    scene: Phaser.Scene,
    private readonly ref: SpriteRef,
    private readonly tile: TileSize,
    label: { text: string; color: string } | null,
    labelStyle: GameConfig['client']['nameLabel'],
    textResolution: number,
  ) {
    const def = ref.def;
    this.sprite = scene.add.sprite(0, 0, keys.sheet(ref), 0).setOrigin(def.anchor.x, def.anchor.y);
    this.labelOffsetY = labelStyle.offsetY;
    this.label = label
      ? scene.add
          .text(0, 0, label.text, {
            fontFamily: labelStyle.fontFamily,
            fontSize: `${labelStyle.fontSizePx}px`,
            color: label.color,
            stroke: labelStyle.strokeColor,
            strokeThickness: labelStyle.strokeThickness,
          })
          .setOrigin(0.5, 1)
          .setResolution(textResolution)
      : null;
  }

  /** `x`,`y` in tile units (fractional mid-step). */
  update(x: number, y: number, facing: Direction, moving: boolean, gait: Gait): void {
    const def = this.ref.def;
    const footX = (x + 0.5) * this.tile.width;
    const footY = (y + 1) * this.tile.height + def.footOffsetY;
    this.sprite.setPosition(footX, footY);
    this.sprite.setDepth(footY); // y-sort: lower entities draw in front
    if (this.label) {
      const top = footY - def.frameHeight * def.anchor.y;
      this.label.setPosition(footX, top - this.labelOffsetY);
      this.label.setDepth(footY + 0.5);
    }

    let anim: 'idle' | 'walk' | 'run' = moving ? gait : 'idle';
    if (anim === 'run' && !def.animations.run) anim = 'walk';
    const key = keys.anim(this.ref, anim, facing);
    if (key !== this.currentKey) {
      // Keep the stride phase when switching walk <-> run so the feet don't restart.
      const wasMoving = this.currentKey.includes(':walk:') || this.currentKey.includes(':run:');
      const phase = this.sprite.anims.currentFrame?.index ?? 1;
      const frames = def.animations[anim]!.frames;
      this.sprite.play({ key, startFrame: moving && wasMoving ? (phase - 1) % frames : 0 });
      this.currentKey = key;
    }

    const tile = { x: Math.round(x), y: Math.round(y) };
    if (!this.visualTile) {
      this.visualTile = tile;
    } else if (tile.x !== this.visualTile.x || tile.y !== this.visualTile.y) {
      const from = this.visualTile;
      this.visualTile = tile;
      this.onEnterTile(tile, from, gait);
    }
  }

  setTextResolution(resolution: number): void {
    this.label?.setResolution(resolution);
  }

  destroy(): void {
    this.sprite.destroy();
    this.label?.destroy();
  }
}
