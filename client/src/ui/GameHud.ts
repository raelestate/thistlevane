import {
  isRichCharacter,
  skillIconPath,
  unlockedSkills,
  type CharacterDefinition,
  type CombatStats,
  type Skill,
  type SpriteDefinition,
} from '@thistlevane/shared';
import { assetUrl, findCharacter, type ClientContent } from '../content/ContentLoader';
import type { ConnectionStatus } from '../net/NetClient';

/** Keybinds for hotbar slots, in order. Capped at 10 — a class can have up to 15 unlocked
 * skills by level 100; beyond slot 10 there's no further keybind (see the integration notes). */
const HOTBAR_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const MAX_HOTBAR_SLOTS = HOTBAR_KEYS.length;

/** One slot of the hotbar. `skill` is null only for the no-class fallback ("Strike", the old
 * generic basic-attack path) — every other slot is a real, data-driven skill. */
export interface HotbarSlot {
  key: string;
  skill: Skill | null;
}

const PORTRAIT_PX = 42;

interface BarElements {
  root: HTMLElement;
  fill: HTMLElement;
  ghost: HTMLElement | null;
  text: HTMLElement;
}

interface UnitFrameElements {
  root: HTMLElement;
  portrait: HTMLElement;
  name: HTMLElement;
  level: HTMLElement;
  title: HTMLElement;
  hp: BarElements;
  mp: BarElements | null;
  xp: BarElements | null;
}

/** Describes whoever is in the target frame. */
export interface TargetView {
  name: string;
  level: number;
  subtitle: string;
  hp: number;
  maxHp: number;
  def: SpriteDefinition;
}

/**
 * The MMORPG chrome: player frame, target frame, hotbar, status overlay and a
 * small developer read-out. It owns DOM only — the scene tells it what to show.
 */
export class GameHud {
  private content: ClientContent;
  private player: UnitFrameElements;
  private target: UnitFrameElements;
  private skillBar: HTMLElement;
  private slots: Array<{ root: HTMLElement; cooldown: HTMLElement; skill: Skill | null }> = [];
  private statusOverlay: HTMLElement;
  private devOverlay: HTMLElement | null;

  private connectionStatus: ConnectionStatus = 'connecting';
  private loadingZone = '';
  private errorMsg = '';
  private downed = false;
  private devText = '';
  /** Memoized so setSkills() only rebuilds the DOM when the unlocked set actually changes. */
  private skillBarClassId: string | null = null;
  private skillBarLevel = -1;

  /** Fired when a hotbar slot is activated (click or keybind). `skillId` is null only for the
   * no-class "Strike" fallback slot — see WorldScene's useSkill(). */
  onSkillSlotActivated: (skillId: string | null) => void = () => {};

  constructor(container: HTMLElement, content: ClientContent, devMode: boolean) {
    this.content = content;
    container.innerHTML = '';

    this.player = this.buildUnitFrame('player-frame', { mp: true, xp: true });
    container.appendChild(this.player.root);

    this.target = this.buildUnitFrame('target-frame', { mp: false, xp: false });
    this.target.root.style.display = 'none';
    this.target.hp.root.classList.add('hostile');
    container.appendChild(this.target.root);

    this.skillBar = this.buildSkillBar();
    container.appendChild(this.skillBar);
    container.appendChild(this.buildHint());

    this.statusOverlay = document.createElement('div');
    this.statusOverlay.id = 'status-overlay';
    this.statusOverlay.textContent = 'Connecting…';
    container.appendChild(this.statusOverlay);

    if (devMode) {
      this.devOverlay = document.createElement('div');
      this.devOverlay.id = 'dev-overlay';
      container.appendChild(this.devOverlay);
    } else {
      this.devOverlay = null;
    }
  }

  // ─────────── DOM builders ───────────

  private buildUnitFrame(id: string, opts: { mp: boolean; xp: boolean }): UnitFrameElements {
    const root = document.createElement('div');
    root.id = id;
    root.className = 'unit-frame panel';

    const portrait = document.createElement('div');
    portrait.className = 'uf-portrait';
    root.appendChild(portrait);

    const info = document.createElement('div');
    info.className = 'uf-info';

    const header = document.createElement('div');
    header.className = 'uf-header';
    const name = document.createElement('span');
    name.className = 'uf-name';
    const level = document.createElement('span');
    level.className = 'uf-level';
    header.append(name, level);

    const title = document.createElement('div');
    title.className = 'uf-title';

    const hp = this.buildBar('hp-bar', true);
    info.append(header, title, hp.root);

    let mp: BarElements | null = null;
    if (opts.mp) {
      mp = this.buildBar('mp-bar', false);
      mp.root.classList.add('thin');
      info.appendChild(mp.root);
    }
    let xp: BarElements | null = null;
    if (opts.xp) {
      xp = this.buildBar('xp-bar', false);
      xp.root.classList.add('sliver');
      xp.text.remove();
      info.appendChild(xp.root);
    }

    root.appendChild(info);
    return { root, portrait, name, level, title, hp, mp, xp };
  }

  private buildBar(className: string, withGhost: boolean): BarElements {
    const root = document.createElement('div');
    root.className = `resource-bar ${className}`;
    let ghost: HTMLElement | null = null;
    if (withGhost) {
      ghost = document.createElement('div');
      ghost.className = 'bar-ghost';
      ghost.style.width = '100%';
      root.appendChild(ghost);
    }
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    const text = document.createElement('span');
    text.className = 'bar-text';
    root.append(fill, text);
    return { root, fill, ghost, text };
  }

  private buildSkillBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.id = 'skill-bar';
    bar.className = 'panel';
    return bar;
  }

  /**
   * (Re)builds the hotbar from this class's own unlocked skills (data-driven — nothing here is
   * per-class or per-skill code). A class with no skills (today just Ashvale) falls back to a
   * single generic "Strike" slot bound to the old basic-attack path. Capped at MAX_HOTBAR_SLOTS;
   * see HOTBAR_KEYS for why. Passives are deliberately left off the bar: they're always-on
   * traits with no activation (cost/cooldown/cast of 0, no clip), not something to press.
   */
  setSkills(allSkills: readonly Skill[], classId: string | null, level: number): void {
    if (classId === this.skillBarClassId && level === this.skillBarLevel) return;
    this.skillBarClassId = classId;
    this.skillBarLevel = level;

    const unlocked = classId ? unlockedSkills(allSkills, classId, level).filter((s) => s.category !== 'passive') : [];
    const slots: HotbarSlot[] = unlocked.length > 0
      ? unlocked.slice(0, MAX_HOTBAR_SLOTS).map((skill, i) => ({ key: HOTBAR_KEYS[i]!, skill }))
      : [{ key: HOTBAR_KEYS[0]!, skill: null }];

    this.skillBar.innerHTML = '';
    this.slots = slots.map((slot) => this.buildSkillSlot(slot));
  }

  private buildSkillSlot(slot: HotbarSlot): { root: HTMLElement; cooldown: HTMLElement; skill: Skill | null } {
    const root = document.createElement('div');
    root.className = 'skill-slot ready';
    const name = slot.skill?.name ?? 'Strike';
    root.title = slot.skill ? `${name} (${slot.key})\n${slot.skill.description}` : `${name} (${slot.key})`;

    const icon = document.createElement('span');
    icon.className = 'slot-icon';
    if (slot.skill) {
      icon.style.backgroundImage = `url(${assetUrl(skillIconPath(slot.skill.icon))})`;
      icon.style.backgroundSize = 'cover';
      icon.style.backgroundPosition = 'center';
    } else {
      // No real skill (no-class fallback): the first icon in the legacy shared icon sheet.
      icon.style.backgroundImage = `url(${assetUrl('ui/icons.png')})`;
      icon.style.backgroundSize = `calc(192px * var(--ui-scale)) calc(32px * var(--ui-scale))`;
      icon.style.backgroundPosition = `calc(2px * var(--ui-scale)) calc(1px * var(--ui-scale))`;
    }

    const cooldown = document.createElement('div');
    cooldown.className = 'cooldown';

    const keybind = document.createElement('span');
    keybind.className = 'keybind';
    keybind.textContent = slot.key;

    root.append(icon, cooldown, keybind);
    const skillId = slot.skill?.id ?? null;
    root.addEventListener('pointerdown', () => this.onSkillSlotActivated(skillId));
    this.skillBar.appendChild(root);
    return { root, cooldown, skill: slot.skill };
  }

  /** The skill bound to hotbar slot `index` (1-based keybind order) — `null` is the no-class
   * "Strike" fallback, `undefined` means there's no slot there at all. Used by digit keybinds. */
  skillAt(index: number): Skill | null | undefined {
    const slot = this.slots[index];
    return slot ? slot.skill : undefined;
  }

  private buildHint(): HTMLElement {
    const hint = document.createElement('div');
    hint.id = 'control-hint';
    hint.innerHTML =
      '<b>Click</b> to move · <b>Shift</b> run · <b>Hover</b> a creature to fight it · <b>WASD</b> also moves · <b>Tab</b> target · <b>Esc</b> clear';
    return hint;
  }

  // ─────────── portraits ───────────

  /** Rich (Thistlevane) classes ship their own portrait image; grid characters show the first
   * idle frame of their sheet, centred, at an integer zoom (the only option they have). */
  private setPortrait(el: HTMLElement, def: SpriteDefinition | CharacterDefinition): void {
    if (isRichCharacter(def)) {
      el.style.backgroundImage = `url(${assetUrl(def.portrait)})`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      return;
    }
    const scale = Math.max(1, Math.round(PORTRAIT_PX / def.frameWidth));
    const rows = Object.values(def.rows).reduce((max, r) => Math.max(max, r), 0) + 1;
    el.style.backgroundImage = `url(${assetUrl(def.sheet)})`;
    el.style.backgroundSize = `${def.columns * def.frameWidth * scale}px ${rows * def.frameHeight * scale}px`;
    const offsetX = Math.round((PORTRAIT_PX - def.frameWidth * scale) / 2);
    const offsetY = def.frameHeight * scale > PORTRAIT_PX ? -2 : Math.round((PORTRAIT_PX - def.frameHeight * scale) / 2);
    el.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
  }

  // ─────────── bars ───────────

  private updateBar(bar: BarElements, current: number, max: number, label = true): void {
    const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
    bar.fill.style.width = `${pct}%`;
    if (bar.ghost) bar.ghost.style.width = `${pct}%`;
    if (label) bar.text.textContent = `${Math.max(0, Math.ceil(current))} / ${max}`;
  }

  // ─────────── status ───────────

  setStatus(status: ConnectionStatus): void {
    this.connectionStatus = status;
    this.refreshStatus();
  }

  setError(message: string): void {
    this.errorMsg = message;
    this.refreshStatus();
  }

  setLoading(zoneName: string): void {
    this.loadingZone = zoneName;
    this.refreshStatus();
  }

  /** Shows/hides the "you died" banner while the server counts down to respawn. */
  setDowned(show: boolean): void {
    this.downed = show;
    this.refreshStatus();
  }

  private refreshStatus(): void {
    const show = (text: string, bad: boolean) => {
      this.statusOverlay.textContent = text;
      this.statusOverlay.className = bad ? 'bad' : '';
      this.statusOverlay.style.display = '';
    };
    if (this.errorMsg) show(this.errorMsg, true);
    else if (this.connectionStatus === 'closed') show('Disconnected — refresh to rejoin.', true);
    else if (this.downed) show('You have fallen… respawning.', true);
    else if (this.loadingZone) show(`Entering ${this.loadingZone}…`, false);
    else if (this.connectionStatus === 'connecting') show('Connecting…', false);
    else this.statusOverlay.style.display = 'none';
  }

  // ─────────── player ───────────

  setPlayer(name: string, characterId: string, level: number, combat: CombatStats): void {
    const def = findCharacter(this.content, characterId);
    this.player.name.textContent = name;
    this.player.level.textContent = `Lv ${level}`;
    this.player.title.textContent = def.title ?? '';
    this.setPortrait(this.player.portrait, def);
    this.updateBar(this.player.hp, combat.maxHp, combat.maxHp);
    if (this.player.mp) {
      this.player.mp.root.title = isRichCharacter(def) ? def.resource : 'MP';
      this.updateBar(this.player.mp, combat.maxMp, combat.maxMp);
    }
  }

  /** `classId`/`level` drive the skill bar (see setSkills) — called once after setPlayer and
   * again whenever either changes. */
  classIdFor(characterId: string): string | null {
    const def = findCharacter(this.content, characterId);
    return isRichCharacter(def) ? def.classId : null;
  }

  updatePlayerHp(current: number, max: number): void {
    this.updateBar(this.player.hp, current, max);
  }

  updatePlayerMp(current: number, max: number): void {
    if (this.player.mp) this.updateBar(this.player.mp, current, max);
  }

  updateXp(current: number, max: number, level: number): void {
    if (this.player.xp) this.updateBar(this.player.xp, current, max, false);
    this.player.level.textContent = `Lv ${level}`;
  }

  // ─────────── target ───────────

  setTarget(view: TargetView): void {
    this.target.root.style.display = '';
    this.target.root.classList.remove('dead');
    this.target.name.textContent = view.name;
    this.target.level.textContent = `Lv ${view.level}`;
    this.target.title.textContent = view.subtitle;
    this.setPortrait(this.target.portrait, view.def);
    this.updateBar(this.target.hp, view.hp, view.maxHp);
  }

  updateTargetHp(current: number, max: number): void {
    this.updateBar(this.target.hp, current, max);
    this.target.root.classList.toggle('dead', current <= 0);
  }

  clearTarget(): void {
    this.target.root.style.display = 'none';
  }

  // ─────────── hotbar ───────────

  /**
   * Sweeps every slot's cooldown curtain from the server's per-skill remaining-ms map (ready
   * skills are simply absent from it). The one `null`-skill fallback slot ("Strike") has no
   * server-tracked cooldown of its own, so it's driven by `basicAttackProgress` instead (0 = just
   * used, 1 = ready) — the same client-mirrored weapon-cooldown sweep as before this integration.
   */
  updateCooldowns(cooldownsMs: Readonly<Record<string, number>>, basicAttackProgress: number): void {
    for (const slot of this.slots) {
      const remaining = slot.skill
        ? Math.max(0, Math.min(1, (cooldownsMs[slot.skill.id] ?? 0) / (slot.skill.cooldown * 1000)))
        : Math.max(0, Math.min(1, 1 - basicAttackProgress));
      slot.cooldown.style.height = `${remaining * 100}%`;
    }
  }

  flashSkill(skillId: string | null): void {
    const slot = this.slots.find((s) => (s.skill?.id ?? null) === skillId);
    if (!slot) return;
    slot.root.classList.add('active');
    window.setTimeout(() => slot.root.classList.remove('active'), 120);
  }

  // ─────────── dev read-out ───────────

  update(stats: {
    zone: string;
    tile: string;
    playerCount: number;
    mobCount: number;
    corrections: number;
    pendingInputs: number;
    gait: string;
    mouseTile: string;
    aim: string;
    nearestMob: string;
  }): void {
    if (!this.devOverlay) return;
    const text =
      `${stats.zone} · ${stats.tile}\n` +
      `${stats.playerCount}p ${stats.mobCount}m · ${stats.gait} · c${stats.corrections} q${stats.pendingInputs}\n` +
      `mouse ${stats.mouseTile} · aim ${stats.aim} · ${stats.nearestMob}`;
    if (text !== this.devText) {
      this.devText = text;
      this.devOverlay.textContent = text;
    }
  }
}
