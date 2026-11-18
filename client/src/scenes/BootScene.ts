import * as Phaser from 'phaser';
import {
  ANIMATION_NAMES,
  DIRECTIONS,
  NON_LOOPING_ANIM_NAMES,
  classAnimationImagePath,
  isRichCharacter,
  parseVfxRef,
  vfxDirectionRow,
  vfxSheetPath,
  type CharacterDefinition,
  type GridCharacterDefinition,
  type RichCharacterDefinition,
  type Skill,
  type SpriteDefinition,
  type VfxManifest,
} from '@thistlevane/shared';

function isGridCharacter(def: CharacterDefinition): def is GridCharacterDefinition {
  return !isRichCharacter(def);
}
import { assetUrl, keys, loadClientContent, type ClientContent, type SpriteRef } from '../content/ContentLoader';

/**
 * Loads data files, then every spritesheet they reference (characters, mobs, effects, the
 * Thistlevane class roster's per-clip strips, and each skill's own VFX sheet), then registers
 * animations exactly as the data describes them. Zone maps are loaded later, when the server
 * says which zone we are in.
 *
 * Every Thistlevane strip (one per clip, one per skill's VFX) stays well under WebGL's
 * MAX_TEXTURE_SIZE (the widest character clip is ~3000px, the widest VFX sheet ~7000px — see
 * docs/thistlevane-pack), so none of them need the chunked-texture workaround the old single
 * combined combat.png required.
 */
export class BootScene extends Phaser.Scene {
  private loadingRoot!: HTMLElement;
  private loadingFill!: HTMLElement;
  private loadingText!: HTMLElement;

  constructor() {
    super('boot');
  }

  create(): void {
    this.buildLoadingUi();
    loadClientContent()
      .then((content) => this.loadSheets(content))
      .catch((err: Error) => {
        console.error('[boot]', err);
        this.loadingRoot.classList.add('bad');
        this.loadingText.textContent = `Failed to load game data:\n${err.message}`;
      });
  }

  /** WorldScene's GameHud clears #game-ui when it takes over, so this never needs explicit teardown. */
  private buildLoadingUi(): void {
    const container = document.getElementById('game-ui');
    if (!container) return;

    this.loadingRoot = document.createElement('div');
    this.loadingRoot.id = 'loading-screen';
    this.loadingRoot.className = 'panel';

    const title = document.createElement('div');
    title.className = 'loading-title';
    title.textContent = 'Loading Thistlevane…';
    this.loadingRoot.appendChild(title);

    const track = document.createElement('div');
    track.className = 'loading-bar-track';
    this.loadingFill = document.createElement('div');
    this.loadingFill.className = 'loading-bar-fill';
    track.appendChild(this.loadingFill);
    this.loadingRoot.appendChild(track);

    this.loadingText = document.createElement('div');
    this.loadingText.className = 'loading-text';
    this.loadingText.textContent = 'Fetching game data…';
    this.loadingRoot.appendChild(this.loadingText);

    container.appendChild(this.loadingRoot);
  }

  /** Grid-sheet entities only: mobs, plus any character still on the simple single-sheet
   * format (today just Ashvale). Rich (Thistlevane) classes are handled separately below. */
  private gridSprites(content: ClientContent): Array<{ kind: 'character' | 'mob'; id: string; def: SpriteDefinition }> {
    const gridCharacters = content.characters.characters.filter(isGridCharacter);
    return [
      ...gridCharacters.map((c) => ({ kind: 'character' as const, id: c.id, def: c })),
      ...Object.entries(content.mobs.mobs).map(([id, def]) => ({ kind: 'mob' as const, id, def })),
    ];
  }

  private richCharacters(content: ClientContent): Array<{ kind: 'character'; id: string; def: RichCharacterDefinition }> {
    return content.characters.characters
      .filter(isRichCharacter)
      .map((def) => ({ kind: 'character' as const, id: def.id, def }));
  }

  private loadSheets(content: ClientContent): void {
    for (const s of this.gridSprites(content)) {
      this.load.spritesheet(keys.sheet(s), assetUrl(s.def.sheet), { frameWidth: s.def.frameWidth, frameHeight: s.def.frameHeight });
    }
    for (const r of this.richCharacters(content)) {
      for (const [clipName, clip] of Object.entries(r.def.clips)) {
        this.load.image(keys.richClipTexture(r, clipName), assetUrl(classAnimationImagePath(r.id, clip.image)));
      }
    }
    for (const e of Object.values(content.effects.effects)) {
      const key = keys.effectSheet(e.sheet, e.frameWidth, e.frameHeight);
      if (!this.textures.exists(key)) {
        this.load.spritesheet(key, assetUrl(e.sheet), { frameWidth: e.frameWidth, frameHeight: e.frameHeight });
      }
    }
    const vfxFrameSize = content.vfxManifest.frame_size;
    for (const skill of content.skills) {
      const { classId, archetype } = parseVfxRef(skill.vfx);
      const key = keys.vfxSheet(classId, archetype);
      if (!this.textures.exists(key)) {
        this.load.spritesheet(key, assetUrl(vfxSheetPath(classId, archetype)), { frameWidth: vfxFrameSize, frameHeight: vfxFrameSize });
      }
    }
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.error(`[boot] failed to load ${file.key} (${String(file.src)})`);
    });
    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      this.loadingFill.style.width = `${Math.round(value * 100)}%`;
    });
    this.load.on(Phaser.Loader.Events.FILE_COMPLETE, () => {
      this.loadingText.textContent = `Loading assets… ${this.load.totalComplete}/${this.load.totalToLoad}`;
    });
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.createAnimations(content);
      this.scene.start('world', content);
    });
    this.load.start();
  }

  private createAnimations(content: ClientContent): void {
    for (const s of this.gridSprites(content)) {
      for (const dir of DIRECTIONS) {
        for (const name of ANIMATION_NAMES) {
          const a = s.def.animations[name];
          if (!a) continue;
          const first = s.def.rows[dir] * s.def.columns + a.startColumn;
          const loops = !(NON_LOOPING_ANIM_NAMES as readonly string[]).includes(name);
          this.anims.create({
            key: keys.anim(s, name, dir),
            frames: this.anims.generateFrameNumbers(keys.sheet(s), { start: first, end: first + a.frames - 1 }),
            frameRate: a.frameRate,
            repeat: loops ? -1 : 0,
          });
        }
      }
    }
    for (const r of this.richCharacters(content)) this.createRichAnimations(r);
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
    for (const skill of content.skills) this.createVfxAnimations(skill, content.vfxManifest);
  }

  /** Builds custom (non-grid) texture frames from each clip's explicit per-frame rects, then
   * registers a Phaser animation per clip/direction using the clip's own per-frame durations —
   * never a single recomputed frameRate, so Thistlevane's authored timing survives untouched.
   * Every clip is already its own strip image, so rects are local to it — no sheet/chunk
   * bookkeeping needed. */
  private createRichAnimations(ref: { kind: 'character'; id: string; def: RichCharacterDefinition }): void {
    for (const [clipName, clip] of Object.entries(ref.def.clips)) {
      const texKey = keys.richClipTexture(ref, clipName);
      const texture = this.textures.get(texKey);
      for (const dir of DIRECTIONS) {
        const rects = clip.rects[dir];
        if (!rects) continue;
        const frames = rects.map((rect, i) => {
          const frameName = keys.richFrame(clipName, dir, i);
          if (!texture.has(frameName)) texture.add(frameName, 0, rect.x, rect.y, rect.w, rect.h);
          return { key: texKey, frame: frameName, duration: clip.durationsMs[i] };
        });
        const avgMs = clip.durationsMs.reduce((a, b) => a + b, 0) / clip.durationsMs.length;
        this.anims.create({
          key: keys.anim(ref, clipName, dir),
          frames,
          frameRate: Math.max(1, Math.round(1000 / Math.max(1, avgMs))),
          repeat: clip.loop ? -1 : 0,
        });
      }
    }
  }

  /** A skill's VFX sheet is a flat grid of `entry.frames` columns × (`entry.rows` if directional,
   * else 1) rows, in that row-major order (Phaser's default spritesheet frame numbering) — so row
   * `r`'s frames start at `r * entry.frames`. Registers one animation per engine Direction, always
   * (even for a non-directional sheet, where every direction just replays row 0), so the caster's
   * call site never has to branch on `directional` itself. */
  private createVfxAnimations(skill: Skill, manifest: VfxManifest): void {
    const entry = manifest.skills[skill.id];
    if (!entry) return;
    const { classId, archetype } = parseVfxRef(skill.vfx);
    const texKey = keys.vfxSheet(classId, archetype);
    const buildFrames = (row: number) => entry.durations_ms.map((duration, i) => ({ key: texKey, frame: row * entry.frames + i, duration }));
    for (const dir of DIRECTIONS) {
      const row = entry.directional ? Math.min(entry.rows - 1, vfxDirectionRow(dir)) : 0;
      this.anims.create({ key: keys.vfxAnim(classId, archetype, dir), frames: buildFrames(row), repeat: entry.loop ? -1 : 0 });
    }
  }
}
