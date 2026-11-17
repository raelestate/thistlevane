import * as Phaser from 'phaser';
import {
  ANIMATION_NAMES,
  DIRECTIONS,
  NON_LOOPING_ANIM_NAMES,
  isRichCharacter,
  vfxSheetPath,
  type CharacterDefinition,
  type GridCharacterDefinition,
  type RichCharacterDefinition,
  type SpriteDefinition,
} from '@thistlevane/shared';

function isGridCharacter(def: CharacterDefinition): def is GridCharacterDefinition {
  return !isRichCharacter(def);
}
import { assetUrl, keys, loadClientContent, type ClientContent, type SpriteRef } from '../content/ContentLoader';

/**
 * Every class's combat sheet (16-17 clips x 8 directions x 96px rows) is 12288-13056px tall —
 * well past the WebGL MAX_TEXTURE_SIZE on a lot of real hardware (observed first-hand: 8192 on
 * this machine's own GPU), which silently fails the texture upload and renders the whole clip as
 * a solid black square. This isn't something to fix by resizing the delivered PNG (that would be
 * restructuring a fixed Thistlevane asset) — instead, each oversized sheet is re-sliced, once at
 * boot, into several GPU-safe textures from the *same already-decoded* image (decoding a tall
 * PNG onto a 2D canvas has nowhere near WebGL's texture-dimension limit), each a whole multiple
 * of one frame's height so no frame rect is ever split across a slice boundary.
 */
const SAFE_TEXTURE_DIM = 4096;

interface ChunkedTexture {
  chunkKeys: string[];
  chunkHeight: number;
}

/**
 * Loads data files, then every spritesheet they reference (characters, mobs, effects, the
 * Thistlevane class roster's locomotion/combat sheets, and the VFX archetype library), then
 * registers animations exactly as the data describes them. Zone maps are loaded later, when
 * the server says which zone we are in.
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
      this.load.image(keys.sheet(r, 'locomotion'), assetUrl(r.def.sheets.locomotion));
      this.load.image(keys.sheet(r, 'combat'), assetUrl(r.def.sheets.combat));
    }
    for (const e of Object.values(content.effects.effects)) {
      const key = keys.effectSheet(e.sheet, e.frameWidth, e.frameHeight);
      if (!this.textures.exists(key)) {
        this.load.spritesheet(key, assetUrl(e.sheet), { frameWidth: e.frameWidth, frameHeight: e.frameHeight });
      }
    }
    const vfxFrameSize = content.vfxManifest.frame_size;
    for (const [classId, entry] of Object.entries(content.vfxManifest.classes)) {
      for (const archetype of entry.archetypes) {
        this.load.spritesheet(keys.vfxSheet(classId, archetype), assetUrl(vfxSheetPath(classId, archetype)), {
          frameWidth: vfxFrameSize,
          frameHeight: vfxFrameSize,
        });
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
    for (const [classId, entry] of Object.entries(content.vfxManifest.classes)) {
      for (const archetype of entry.archetypes) {
        const a = content.vfxManifest.archetypes[archetype];
        if (!a) continue;
        const frames = a.durations_ms.map((duration, i) => ({ key: keys.vfxSheet(classId, archetype), frame: i, duration }));
        this.anims.create({ key: keys.vfxAnim(classId, archetype), frames, repeat: a.loop ? -1 : 0 });
      }
    }
  }

  /** Builds custom (non-grid) texture frames from each clip's explicit per-frame rects, then
   * registers a Phaser animation per clip/direction using the clip's own per-frame durations —
   * never a single recomputed frameRate, so Thistlevane's authored timing survives untouched. */
  private createRichAnimations(ref: { kind: 'character'; id: string; def: RichCharacterDefinition }): void {
    const chunkedByTexKey = new Map<string, ChunkedTexture | null>();
    for (const [clipName, clip] of Object.entries(ref.def.clips)) {
      const texKey = keys.sheet(ref, clip.sheet);
      if (!chunkedByTexKey.has(texKey)) {
        chunkedByTexKey.set(texKey, this.chunkIfOversized(texKey, ref.def.frameHeight));
      }
      const chunked = chunkedByTexKey.get(texKey)!;
      for (const dir of DIRECTIONS) {
        const rects = clip.rects[dir];
        if (!rects) continue;
        const frames = rects.map((rect, i) => {
          const { key, y } = this.resolveFrameTexture(texKey, chunked, rect.y);
          const frameName = keys.richFrame(clipName, dir, i);
          const texture = this.textures.get(key);
          if (!texture.has(frameName)) texture.add(frameName, 0, rect.x, y, rect.w, rect.h);
          return { key, frame: frameName, duration: clip.durationsMs[i] };
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

  /** If `texKey`'s real decoded size fits under SAFE_TEXTURE_DIM, returns null (use as-is).
   * Otherwise slices it into GPU-safe chunk textures and returns their keys + chunk height. */
  private chunkIfOversized(texKey: string, frameHeight: number): ChunkedTexture | null {
    const texture = this.textures.get(texKey);
    const source = texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const width = source.width;
    const height = source.height;
    if (width <= SAFE_TEXTURE_DIM && height <= SAFE_TEXTURE_DIM) return null;

    const framesPerChunk = Math.max(1, Math.floor(SAFE_TEXTURE_DIM / frameHeight));
    const chunkHeight = framesPerChunk * frameHeight;
    const chunkKeys: string[] = [];
    for (let y = 0, i = 0; y < height; y += chunkHeight, i += 1) {
      const sliceHeight = Math.min(chunkHeight, height - y);
      const chunkKey = `${texKey}#chunk${i}`;
      if (!this.textures.exists(chunkKey)) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = sliceHeight;
        canvas.getContext('2d')!.drawImage(source, 0, y, width, sliceHeight, 0, 0, width, sliceHeight);
        this.textures.addCanvas(chunkKey, canvas);
      }
      chunkKeys.push(chunkKey);
    }
    this.textures.remove(texKey); // the oversized source texture can't render on the GPU — drop it
    console.warn(`[boot] "${texKey}" is ${width}x${height}, past this GPU's safe texture size — split into ${chunkKeys.length} chunks`);
    return { chunkKeys, chunkHeight };
  }

  private resolveFrameTexture(originalKey: string, chunked: ChunkedTexture | null, rectY: number): { key: string; y: number } {
    if (!chunked) return { key: originalKey, y: rectY };
    const chunkIndex = Math.min(chunked.chunkKeys.length - 1, Math.floor(rectY / chunked.chunkHeight));
    return { key: chunked.chunkKeys[chunkIndex]!, y: rectY - chunkIndex * chunked.chunkHeight };
  }
}
