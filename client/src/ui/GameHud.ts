import type { CombatStats, SpriteDefinition } from '@thistlevane/shared';
import { assetUrl, findCharacter, type ClientContent } from '../content/ContentLoader';
import type { ConnectionStatus } from '../net/NetClient';

/** One slot of the hotbar. Only `strike` is wired to anything today. */
export interface SkillSlot {
  id: string;
  name: string;
  /** Column in assets/ui/icons.png (16px cells). */
  icon: number;
  key: string;
  locked: boolean;
}

export const SKILL_SLOTS: SkillSlot[] = [
  { id: 'strike', name: 'Strike', icon: 0, key: '1', locked: false },
  { id: 'bolt', name: 'Thistle Bolt', icon: 1, key: '2', locked: true },
  { id: 'guard', name: 'Guard', icon: 2, key: '3', locked: true },
  { id: 'dash', name: 'Dash', icon: 3, key: '4', locked: true },
  { id: 'salve', name: 'Salve', icon: 4, key: '5', locked: true },
  { id: 'lantern', name: 'Lantern', icon: 5, key: '6', locked: true },
];

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
  private slots: Array<{ root: HTMLElement; cooldown: HTMLElement }> = [];
  private statusOverlay: HTMLElement;
  private devOverlay: HTMLElement;

  private connectionStatus: ConnectionStatus = 'connecting';
  private loadingZone = '';
  private errorMsg = '';
  private downed = false;
  private devText = '';

  /** Fired when a hotbar slot is clicked. */
  onSkill: (slot: SkillSlot) => void = () => {};

  constructor(container: HTMLElement, content: ClientContent) {
    this.content = content;
    container.innerHTML = '';

    this.player = this.buildUnitFrame('player-frame', { mp: true, xp: true });
    container.appendChild(this.player.root);

    this.target = this.buildUnitFrame('target-frame', { mp: false, xp: false });
    this.target.root.style.display = 'none';
    this.target.hp.root.classList.add('hostile');
    container.appendChild(this.target.root);

    container.appendChild(this.buildSkillBar());
    container.appendChild(this.buildHint());

    this.statusOverlay = document.createElement('div');
    this.statusOverlay.id = 'status-overlay';
    this.statusOverlay.textContent = 'Connecting…';
    container.appendChild(this.statusOverlay);

    this.devOverlay = document.createElement('div');
    this.devOverlay.id = 'dev-overlay';
    container.appendChild(this.devOverlay);
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
    for (const slot of SKILL_SLOTS) {
      const root = document.createElement('div');
      root.className = `skill-slot ${slot.locked ? 'locked' : 'ready'}`;
      root.title = slot.locked ? `${slot.name} — not learned yet` : `${slot.name} (${slot.key})`;

      const icon = document.createElement('span');
      icon.className = 'slot-icon';
      // 16px cells drawn at 2×, so each step is 32 CSS px before the UI scale.
      icon.style.backgroundPositionX = `calc(${-32 * slot.icon}px * var(--ui-scale) + 2px * var(--ui-scale))`;

      const cooldown = document.createElement('div');
      cooldown.className = 'cooldown';

      const keybind = document.createElement('span');
      keybind.className = 'keybind';
      keybind.textContent = slot.key;

      root.append(icon, cooldown, keybind);
      root.addEventListener('pointerdown', () => this.onSkill(slot));
      bar.appendChild(root);
      this.slots.push({ root, cooldown });
    }
    return bar;
  }

  private buildHint(): HTMLElement {
    const hint = document.createElement('div');
    hint.id = 'control-hint';
    hint.innerHTML =
      '<b>WASD</b> move · <b>Shift</b> run · <b>Mouse</b> aim · <b>Numpad1</b> attack · <b>Tab</b> / click target · <b>Esc</b> clear';
    return hint;
  }

  // ─────────── portraits ───────────

  /** Shows the first idle frame of a sheet, centred, at an integer zoom. */
  private setPortrait(el: HTMLElement, def: SpriteDefinition): void {
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
    if (this.player.mp) this.updateBar(this.player.mp, combat.maxMp, combat.maxMp);
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

  /** `progress` 0 = just used (slot fully dark), 1 = ready. */
  setCooldown(index: number, progress: number): void {
    const slot = this.slots[index];
    if (!slot) return;
    const remaining = Math.max(0, Math.min(1, 1 - progress));
    slot.cooldown.style.height = `${remaining * 100}%`;
  }

  flashSlot(index: number): void {
    const slot = this.slots[index];
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
