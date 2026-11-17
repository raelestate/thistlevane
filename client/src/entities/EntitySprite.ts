import * as Phaser from 'phaser';
import { isRichCharacter, type AnimationName, type AttachKey, type Direction, type Gait, type GameConfig } from '@thistlevane/shared';
import { keys, type SpriteRef } from '../content/ContentLoader';

/** Engine AnimationName → Thistlevane clip name, for the handful that don't share a name
 * (idle/walk/run/run_stop/death already match verbatim, so they need no entry here). */
const RICH_CLIP_FOR_ANIM: Partial<Record<AnimationName, string>> = {
  attack: 'attack_1', attack_ranged: 'attack_1', hit: 'hurt', cast: 'cast_release', block: 'guard',
};

function clipNameFor(def: SpriteRef['def'], anim: AnimationName): string {
  return isRichCharacter(def) ? (RICH_CLIP_FOR_ANIM[anim] ?? anim) : anim;
}

/** Does this entity have a clip for `anim` (after the rich name mapping above)? Works for both
 * the grid single-sheet format (mobs, Ashvale) and a Thistlevane class's own named clips. */
function clipOf(def: SpriteRef['def'], anim: AnimationName): { frames: number } | undefined {
  const name = clipNameFor(def, anim);
  if (isRichCharacter(def)) return def.clips[name];
  return (def.animations as Partial<Record<string, { frames: number }>>)[name];
}

export interface TileSize {
  width: number;
  height: number;
}

/**
 * Explicit animation states, in ascending priority. `idle`/`moving` are the resting states
 * `update()` drives every frame; everything else is a one-shot (or held) request that only
 * takes over when its priority is at least as high as whatever is currently playing — so a
 * more important state, like `dead`, can never be clobbered by a less important one.
 * `casting`/`interacting`/`blocking` have no caller yet (no skill/interactable/guard system
 * exists) but are wired here so a future system doesn't need a second animation refactor.
 */
export type AnimState = 'idle' | 'moving' | 'blocking' | 'attacking' | 'casting' | 'interacting' | 'hit' | 'resurrecting' | 'dead';

const PRIORITY: Record<AnimState, number> = {
  idle: 0, moving: 0, blocking: 1, attacking: 1, casting: 1, interacting: 1, hit: 2, resurrecting: 3, dead: 4,
};

/** Held duration (ms) for the programmatic stand-in used when an entity has no authored clip
 * for a state. `hit` has none: `flashHit()`'s tint is already its own feedback. `dead` has none
 * either: its fallback just dims and holds, with no timer to clean up. */
const FALLBACK_DURATION_MS: Partial<Record<AnimState, number>> = { attacking: 220, casting: 260, interacting: 200, resurrecting: 300 };

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
  /** The clip name and direction behind currentKey, tracked separately so attachPoint() can look
   * up attach data without having to parse it back out of the Phaser animation key. */
  private currentClipName = 'idle';
  private currentDir: Direction = 'down';
  private current: AnimState = 'idle';
  /** True while a run→idle `run_stop` transition clip is playing (orthogonal to `current`: it's
   * a movement nicety, not a combat state, so it never raises priority). */
  private stopping = false;
  private lastFacing: Direction = 'down';
  /** Bumped on every state change; completion callbacks capture it and no-op if it's stale, so
   * a listener from an interrupted animation can never clear a later, unrelated state. */
  private version = 0;

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
    const initial = isRichCharacter(def)
      ? { tex: keys.sheet(ref, def.clips.idle?.sheet ?? 'locomotion'), frame: keys.richFrame('idle', 'down', 0) }
      : { tex: keys.sheet(ref), frame: 0 };
    this.sprite = scene.add.sprite(0, 0, initial.tex, initial.frame).setOrigin(def.anchor.x, def.anchor.y);
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
    this.lastFacing = facing;
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

    if (PRIORITY[this.current] <= 0 && !this.stopping) {
      this.current = moving ? 'moving' : 'idle';
      let anim: 'idle' | 'walk' | 'run' = moving ? gait : 'idle';
      if (anim === 'run' && !clipOf(def, 'run')) anim = 'walk';
      const clipName = clipNameFor(def, anim);
      const key = keys.anim(this.ref, clipName, facing);
      if (key !== this.currentKey) {
        const wasRunning = this.currentKey.includes(':run:');
        if (anim === 'idle' && wasRunning && clipOf(def, 'run_stop')) {
          const stopClip = clipNameFor(def, 'run_stop');
          const stopKey = keys.anim(this.ref, stopClip, facing);
          this.stopping = true;
          this.currentKey = stopKey;
          this.currentClipName = stopClip;
          this.currentDir = facing;
          this.sprite.play(stopKey);
          this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
            if (this.currentKey === stopKey) this.stopping = false;
          });
        } else {
          const wasMoving = wasRunning || this.currentKey.includes(':walk:');
          const phase = this.sprite.anims.currentFrame?.index ?? 1;
          const frames = clipOf(def, anim)!.frames;
          this.sprite.play({ key, startFrame: moving && wasMoving ? (phase - 1) % frames : 0 });
          this.currentKey = key;
          this.currentClipName = clipName;
          this.currentDir = facing;
        }
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

  /**
   * Requests a transition into `state`, playing `anim` if the entity has that clip (falling
   * back to a brief programmatic stand-in if not — see `playFallback`). Only takes effect if
   * `state` is at least as important as whatever is currently playing, so e.g. a `hit` can't
   * interrupt `dead`, but a second `attacking` request (a fast follow-up swing) can restart the
   * clip, since the server's own cooldown is what gates how often a real `'attack'` event
   * arrives in the first place.
   */
  request(state: AnimState, anim: AnimationName, facing: Direction): void {
    if (PRIORITY[state] < PRIORITY[this.current]) return;
    this.playClipOrFallback(state, anim, facing);
  }

  /**
   * Unconditionally returns the entity to life: clears whatever `dead` (or anything else) was
   * holding, restores full opacity and animation playback, and goes back to idle — playing a
   * `resurrect` clip first if the entity has one. Callable from any state; nothing can block it.
   */
  revive(): void {
    this.version += 1; // invalidate any in-flight death-related callback immediately
    this.stopping = false;
    this.sprite.setAlpha(1);
    this.sprite.setScale(1, 1);
    this.sprite.anims.resume();
    this.setHealth(null);
    if (clipOf(this.ref.def, 'resurrect')) this.playClipOrFallback('resurrecting', 'resurrect', this.lastFacing);
    else this.current = 'idle';
  }

  private playClipOrFallback(state: AnimState, anim: AnimationName, facing: Direction): void {
    this.lastFacing = facing;
    this.current = state;
    this.stopping = false;
    this.version += 1;
    const myVersion = this.version;
    const clip = clipOf(this.ref.def, anim);
    if (!clip) {
      this.playFallback(state, myVersion);
      return;
    }
    const clipName = clipNameFor(this.ref.def, anim);
    const key = keys.anim(this.ref, clipName, facing);
    this.currentKey = key;
    this.currentClipName = clipName;
    this.currentDir = facing;
    this.sprite.play(key);
    if (state === 'dead') return; // non-looping; holds its last frame forever until revive()
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      if (this.version === myVersion) this.current = 'idle';
    });
  }

  /**
   * Plays an arbitrary named clip directly — a skill's own combat/signature clip (e.g.
   * "palm_combo"), which isn't part of the closed AnimationName set request() uses. Always
   * interrupts whatever's currently playing (a cast is always a deliberate action), and is a
   * silent no-op for anything that isn't a rich (Thistlevane) character or has no such clip.
   */
  playSkillClip(clipName: string, facing: Direction, state: AnimState = 'casting'): void {
    const def = this.ref.def;
    if (!isRichCharacter(def) || !def.clips[clipName]) return;
    this.lastFacing = facing;
    this.current = state;
    this.stopping = false;
    this.version += 1;
    const myVersion = this.version;
    const key = keys.anim(this.ref, clipName, facing);
    this.currentKey = key;
    this.currentClipName = clipName;
    this.currentDir = facing;
    this.sprite.play(key);
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      if (this.version === myVersion) this.current = 'idle';
    });
  }

  /**
   * World position (+ depth) of a named attach point (hand_r, chest, ...) on whatever clip/
   * direction/frame is playing right now — for parenting a skill's VFX or a weapon trail to the
   * right spot. Rich (Thistlevane) characters only; everything else returns null.
   */
  attachPoint(point: AttachKey): { x: number; y: number; depth: number } | null {
    const def = this.ref.def;
    if (!isRichCharacter(def)) return null;
    const clip = def.clips[this.currentClipName];
    const framesForDir = clip?.attach?.[this.currentDir];
    if (!framesForDir || framesForDir.length === 0) return null;
    const frameIndex = Math.max(0, Math.min(framesForDir.length - 1, (this.sprite.anims.currentFrame?.index ?? 1) - 1));
    const value = framesForDir[frameIndex]?.[point];
    if (!value) return null;
    const anchorPxX = def.anchor.x * def.frameWidth;
    const anchorPxY = def.anchor.y * def.frameHeight;
    return { x: this.sprite.x + (value[0] - anchorPxX), y: this.sprite.y + (value[1] - anchorPxY), depth: value[2] };
  }

  /** No authored clip for this entity/anim (true for every mob and all but one character's
   * combat clips today) — a small tween instead of silently doing nothing. */
  private playFallback(state: AnimState, myVersion: number): void {
    if (state === 'dead') {
      this.sprite.setAlpha(0.35); // held until revive(); matches the mob "defeated" look already in use
      return;
    }
    const duration = FALLBACK_DURATION_MS[state];
    if (!duration) {
      this.current = 'idle'; // 'hit'/'blocking' have no tween fallback
      return;
    }
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: 1.15,
      scaleY: 0.85,
      duration: duration / 2,
      yoyo: true,
      onComplete: () => {
        if (this.version !== myVersion) return;
        this.sprite.setScale(1, 1);
        this.current = 'idle';
      },
    });
  }

  /** Last facing direction passed to `update()` — used to pick a direction for hit/death reactions. */
  get facing(): Direction {
    return this.lastFacing;
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
    this.scene.time.delayedCall(70, () => {
      if (!this.sprite.active) return;
      this.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    });
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
