import * as Phaser from 'phaser';
import type { EffectCatalog } from '@thistlevane/shared';
import { keys } from '../content/ContentLoader';

/** Plays one-shot sprite effects (dust, leaves, splashes) defined in effects.json. */
export class EffectsManager {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly catalog: EffectCatalog,
  ) {}

  /** `x`,`y` = world position of the effect's anchor; `depthY` = y-sort reference (usually feet). */
  play(effectId: string | undefined, x: number, y: number, depthY = y): void {
    if (!effectId) return;
    const def = this.catalog.effects[effectId];
    if (!def) {
      console.warn(`[effects] unknown effect "${effectId}" (check effects.json and map/character data)`);
      return;
    }
    const sprite = this.scene.add
      .sprite(x, y, keys.effectSheet(def.sheet, def.frameWidth, def.frameHeight), def.startFrame)
      .setOrigin(def.anchor.x, def.anchor.y)
      .setDepth(def.layer === 'below' ? depthY - 0.25 : depthY + 0.25);
    sprite.play(keys.effectAnim(effectId));
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());
  }
}
