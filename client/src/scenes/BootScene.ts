import * as Phaser from 'phaser';
import { DIRECTIONS, ANIMATION_NAMES, type SpriteDefinition } from '@thistlevane/shared';
import { assetUrl, keys, loadClientContent, type ClientContent } from '../content/ContentLoader';

/**
 * Loads data files, then every spritesheet they reference (characters, mobs, effects),
 * then registers animations exactly as the data describes them. Zone maps are loaded
 * later, when the server says which zone we are in.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    loadClientContent()
      .then((content) => this.loadSheets(content))
      .catch((err: Error) => {
        console.error('[boot]', err);
        const hud = document.getElementById('hud');
        if (hud) {
          hud.textContent = `Failed to load game data:\n${err.message}`;
          hud.classList.add('bad');
        }
      });
  }

  private sprites(content: ClientContent): Array<{ kind: 'character' | 'mob'; id: string; def: SpriteDefinition }> {
    return [
      ...content.characters.characters.map((c) => ({ kind: 'character' as const, id: c.id, def: c })),
      ...Object.entries(content.mobs.mobs).map(([id, def]) => ({ kind: 'mob' as const, id, def })),
    ];
  }

  private loadSheets(content: ClientContent): void {
    for (const s of this.sprites(content)) {
      this.load.spritesheet(keys.sheet(s), assetUrl(s.def.sheet), { frameWidth: s.def.frameWidth, frameHeight: s.def.frameHeight });
    }
    for (const e of Object.values(content.effects.effects)) {
      const key = keys.effectSheet(e.sheet, e.frameWidth, e.frameHeight);
      if (!this.textures.exists(key)) {
        this.load.spritesheet(key, assetUrl(e.sheet), { frameWidth: e.frameWidth, frameHeight: e.frameHeight });
      }
    }
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.error(`[boot] failed to load ${file.key} (${String(file.src)})`);
    });
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.createAnimations(content);
      this.scene.start('world', content);
    });
    this.load.start();
  }

  private createAnimations(content: ClientContent): void {
    for (const s of this.sprites(content)) {
      for (const dir of DIRECTIONS) {
        for (const name of ANIMATION_NAMES) {
          const a = s.def.animations[name];
          if (!a) continue;
          const first = s.def.rows[dir] * s.def.columns + a.startColumn;
          this.anims.create({
            key: keys.anim(s, name, dir),
            frames: this.anims.generateFrameNumbers(keys.sheet(s), { start: first, end: first + a.frames - 1 }),
            frameRate: a.frameRate,
            repeat: -1,
          });
        }
      }
    }
    for (const [id, e] of Object.entries(content.effects.effects)) {
      this.anims.create({
        key: keys.effectAnim(id),
        frames: this.anims.generateFrameNumbers(keys.effectSheet(e.sheet, e.frameWidth, e.frameHeight), {
          start: e.startFrame,
          end: e.startFrame + e.frames - 1,
        }),
        frameRate: e.frameRate,
        repeat: 0,
      });
    }
  }
}
