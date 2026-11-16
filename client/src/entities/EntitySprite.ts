import * as Phaser from 'phaser';
import type { AnimationName, Direction, Gait, GameConfig } from '@thistlevane/shared';
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

  private label: Phaser.GameObjects.Text | null;
  private readonly labelOffsetY: number;
  private currentKey = '';
  private combatLock: AnimationName | null = null;
  onCombatComplete: ((anim: AnimationName) => void) | null = null;

  /** Floating health bar, built on demand (mobs only get one once you fight them). */
  private hpBack: Phaser.GameObjects.Rectangle | null = null;
  private hpFill: Phaser.GameObjects.Rectangle | null = null;
  private hpWidth = 0;
  private topY = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ref: SpriteRef,
    private readonly tile: TileSize,
    label: { text: string; color: string } | null,
    private readonly labelStyle: GameConfig['client']['nameLabel'],
    private textResolution: number,
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
    const top = footY - def.frameHeight * def.anchor.y;
    this.topY = top;
    if (this.label) {
      this.label.setPosition(footX, top - this.labelOffsetY);
      this.label.setDepth(footY + 0.5);
    }
    if (this.hpBack && this.hpFill) {
      const barY = top - this.labelOffsetY - (this.label ? this.labelStyle.fontSizePx + 2 : 0) - 2;
      this.hpBack.setPosition(footX, barY).setDepth(footY + 0.6);
      this.hpFill.setPosition(footX - this.hpWidth / 2, barY).setDepth(footY + 0.7);
    }

    if (!this.combatLock) {
      let anim: 'idle' | 'walk' | 'run' = moving ? gait : 'idle';
      if (anim === 'run' && !def.animations.run) anim = 'walk';
      const key = keys.anim(this.ref, anim, facing);
      if (key !== this.currentKey) {
        const wasMoving = this.currentKey.includes(':walk:') || this.currentKey.includes(':run:');
        const phase = this.sprite.anims.currentFrame?.index ?? 1;
        const frames = def.animations[anim]!.frames;
        this.sprite.play({ key, startFrame: moving && wasMoving ? (phase - 1) % frames : 0 });
        this.currentKey = key;
      }
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

  playCombat(anim: 'attack' | 'hit' | 'death', facing: Direction): void {
    const def = this.ref.def;
    if (!def.animations[anim]) return;
    const key = keys.anim(this.ref, anim, facing);
    this.combatLock = anim;
    this.currentKey = key;
    this.sprite.play(key);
    if (anim !== 'death') {
      this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        const finished = this.combatLock;
        this.combatLock = null;
        if (finished && this.onCombatComplete) this.onCombatComplete(finished);
      });
    }
  }

  get isInCombatAnim(): boolean {
    return this.combatLock !== null;
  }

  /** World position of the sprite's feet — where effects and target rings go. */
  get footPosition(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  /** World position of the sprite's head — where damage numbers start. */
  get headY(): number {
    return this.topY;
  }

  /** Adds (or updates) the floating name above an entity that had none. */
  setLabel(text: string, color: string): void {
    if (!this.label) {
      this.label = this.scene.add
        .text(this.sprite.x, this.topY, text, {
          fontFamily: this.labelStyle.fontFamily,
          fontSize: `${this.labelStyle.fontSizePx}px`,
          color,
          stroke: this.labelStyle.strokeColor,
          strokeThickness: this.labelStyle.strokeThickness,
        })
        .setOrigin(0.5, 1)
        .setResolution(this.textResolution);
    } else {
      this.label.setText(text).setColor(color);
    }
  }

  removeLabel(): void {
    this.label?.destroy();
    this.label = null;
  }

  /** Shows a small health bar above the entity. `null` hides it again. */
  setHealth(current: number | null, max = 1): void {
    if (current === null) {
      this.hpBack?.destroy();
      this.hpFill?.destroy();
      this.hpBack = null;
      this.hpFill = null;
      return;
    }
    const width = Math.max(14, this.ref.def.frameWidth - 8);
    if (!this.hpBack || !this.hpFill) {
      this.hpBack = this.scene.add.rectangle(0, 0, width + 2, 4, 0x1a1020).setOrigin(0.5, 0.5);
      this.hpFill = this.scene.add.rectangle(0, 0, width, 2, 0xd04438).setOrigin(0, 0.5);
      this.hpWidth = width;
    }
    const ratio = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
    this.hpFill.width = Math.max(ratio > 0 ? 1 : 0, Math.round(width * ratio));
    this.hpFill.fillColor = ratio > 0.5 ? 0xd04438 : ratio > 0.2 ? 0xd07820 : 0x903020;
  }

  /** White flash on being hit (Phaser 4 splits tint colour from tint mode). */
  flashHit(): void {
    this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(70, () => this.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
  }

  /** Dims and stops a defeated mob until the server's copy wanders off. */
  setDefeated(defeated: boolean): void {
    this.sprite.setAlpha(defeated ? 0.35 : 1);
    if (defeated) this.sprite.anims.pause();
    else this.sprite.anims.resume();
  }

  setTextResolution(resolution: number): void {
    this.textResolution = resolution;
    this.label?.setResolution(resolution);
  }

  destroy(): void {
    this.sprite.destroy();
    this.label?.destroy();
    this.hpBack?.destroy();
    this.hpFill?.destroy();
  }
}
