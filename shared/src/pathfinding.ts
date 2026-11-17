/**
 * A* pathfinding over any `Walkability` — the same interface `stepMovement` itself consumes
 * (shared/src/movement.ts) — so a planned path is guaranteed to be exactly what the server will
 * accept, and automatically inherits the elevation/ramp rule for free.
 */
import { DIRECTION_DELTAS, type Walkability } from './movement';
import { DIRECTIONS, type Direction } from './protocol';

export interface PathfindingOptions {
  /** Upper bound on nodes expanded before giving up. A click across unreachable terrain on a
   * huge map should fail fast, not exhaustively scan the whole reachable component. */
  maxNodes?: number;
}

const DEFAULT_MAX_NODES = 20_000;

interface QueuedNode {
  x: number;
  y: number;
  g: number;
  f: number;
}

/**
 * Chebyshev ("chess king") distance — the admissible heuristic for this grid, where every one
 * of the 8 directions costs exactly the same tick count (stepMovement's `stepTicks` depends
 * only on walk/run, never on direction — a diagonal step is not "more expensive" the way it
 * would be under a Euclidean-cost model).
 */
function heuristic(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

/** Small binary min-heap ordered by `f`, so the open set's cheapest node is always O(log n) to pop. */
class MinHeap {
  private readonly items: QueuedNode[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: QueuedNode): void {
    const items = this.items;
    items.push(node);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent]!.f <= items[i]!.f) break;
      [items[parent], items[i]] = [items[i]!, items[parent]!];
      i = parent;
    }
  }

  pop(): QueuedNode | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = i * 2 + 2;
        let smallest = i;
        if (left < items.length && items[left]!.f < items[smallest]!.f) smallest = left;
        if (right < items.length && items[right]!.f < items[smallest]!.f) smallest = right;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i]!, items[smallest]!];
        i = smallest;
      }
    }
    return top;
  }
}

function reconstruct(cameFrom: Map<string, { x: number; y: number; dir: Direction }>, goal: { x: number; y: number }): Direction[] {
  const dirs: Direction[] = [];
  let at = key(goal.x, goal.y);
  let node = cameFrom.get(at);
  while (node) {
    dirs.push(node.dir);
    at = key(node.x, node.y);
    node = cameFrom.get(at);
  }
  return dirs.reverse();
}

/**
 * Finds an ordered sequence of directions from `start` to `goal`, in tile coordinates. Every
 * step costs 1 regardless of direction, matching the engine's own movement rule exactly.
 * Traversability is exactly `world.isWalkable(x, y, fromX, fromY)` — the same check
 * `stepMovement` makes — so a diagonal step that "corner-cuts" between two touching blocked
 * tiles is accepted here if and only if the server would also accept it; this mirrors the
 * existing engine behaviour (mob chase already does the same) rather than being stricter.
 *
 * Returns `[]` if already standing on the goal, `null` if the goal isn't walkable or no path is
 * found within `maxNodes` expansions (an explicit, fast failure rather than an unbounded search).
 */
export function findPath(
  start: { x: number; y: number },
  goal: { x: number; y: number },
  world: Walkability,
  options: PathfindingOptions = {},
): Direction[] | null {
  if (start.x === goal.x && start.y === goal.y) return [];
  if (!world.isWalkable(goal.x, goal.y)) return null;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;

  const open = new MinHeap();
  open.push({ x: start.x, y: start.y, g: 0, f: heuristic(start.x, start.y, goal.x, goal.y) });
  const bestG = new Map<string, number>([[key(start.x, start.y), 0]]);
  const cameFrom = new Map<string, { x: number; y: number; dir: Direction }>();
  const closed = new Set<string>();

  let expanded = 0;
  while (open.size > 0) {
    const current = open.pop()!;
    const currentKey = key(current.x, current.y);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);
    expanded += 1;
    if (expanded > maxNodes) return null;

    if (current.x === goal.x && current.y === goal.y) return reconstruct(cameFrom, goal);

    for (const dir of DIRECTIONS) {
      const { dx, dy } = DIRECTION_DELTAS[dir];
      const nx = current.x + dx;
      const ny = current.y + dy;
      const nKey = key(nx, ny);
      if (closed.has(nKey)) continue;
      if (!world.isWalkable(nx, ny, current.x, current.y)) continue;
      const g = current.g + 1;
      const known = bestG.get(nKey);
      if (known !== undefined && g >= known) continue;
      bestG.set(nKey, g);
      cameFrom.set(nKey, { x: current.x, y: current.y, dir });
      open.push({ x: nx, y: ny, g, f: g + heuristic(nx, ny, goal.x, goal.y) });
    }
  }
  return null;
}
