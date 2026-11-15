import type { CardinalDirection, Direction, GameConfig, MoveIntent } from '@thistlevane/shared';

type Controls = GameConfig['client']['controls'];
const CARDINAL_ACTIONS: CardinalDirection[] = ['up', 'down', 'left', 'right'];

/**
 * Turns key presses into a MoveIntent. Bindings come from game-config.json
 * (client.controls, KeyboardEvent.code values, so WASD works on any layout).
 * When two perpendicular directions are held (e.g. up+right), emits the diagonal.
 * When opposing directions cancel, falls back to the remaining axis.
 */
export class InputController {
  private readonly held: CardinalDirection[] = [];
  private readonly codeToDirection = new Map<string, CardinalDirection>();
  private readonly runCodes: Set<string>;
  private readonly runHeld = new Set<string>();

  constructor(controls: Controls) {
    for (const dir of CARDINAL_ACTIONS) for (const code of controls[dir]) this.codeToDirection.set(code, dir);
    this.runCodes = new Set(controls.run);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
    document.addEventListener('visibilitychange', this.releaseAll);
  }

  get intent(): MoveIntent {
    const heldSet = new Set(this.held);
    const up = heldSet.has('up');
    const down = heldSet.has('down');
    const left = heldSet.has('left');
    const right = heldSet.has('right');
    const v = up && !down ? 'up' : down && !up ? 'down' : null;
    const h = left && !right ? 'left' : right && !left ? 'right' : null;
    let dir: Direction | null = null;
    if (v && h) dir = `${v}-${h}` as Direction;
    else if (v) dir = v;
    else if (h) dir = h;
    return { dir, run: this.runHeld.size > 0 };
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.releaseAll);
    document.removeEventListener('visibilitychange', this.releaseAll);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.runCodes.has(event.code)) this.runHeld.add(event.code);
    const dir = this.codeToDirection.get(event.code);
    if (!dir) return;
    event.preventDefault();
    if (!this.held.includes(dir)) this.held.push(dir);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.runHeld.delete(event.code);
    const dir = this.codeToDirection.get(event.code);
    if (!dir) return;
    const index = this.held.indexOf(dir);
    if (index !== -1) this.held.splice(index, 1);
  };

  private readonly releaseAll = (): void => {
    this.held.length = 0;
    this.runHeld.clear();
  };
}
