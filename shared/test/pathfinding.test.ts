import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTION_DELTAS, findPath, type Walkability } from '../src/index';

// 20x20 open grid, no obstacles — for optimality and node-budget checks.
const openGrid: Walkability = { isWalkable: (x, y) => x >= 0 && y >= 0 && x < 20 && y < 20 };

// 10x10 grid with a wall column at x=5 from y=0..7 (gap at y=8,9) — forces a detour around it.
const wallGrid: Walkability = {
  isWalkable: (x, y) => x >= 0 && y >= 0 && x < 10 && y < 10 && !(x === 5 && y < 8),
};

// 10x10 grid fully split in two by a solid wall column — nothing on one side can reach the other.
const splitGrid: Walkability = {
  isWalkable: (x, y) => x >= 0 && y >= 0 && x < 10 && y < 10 && x !== 5,
};

test('already standing on the goal returns an empty path', () => {
  assert.deepEqual(findPath({ x: 3, y: 3 }, { x: 3, y: 3 }, openGrid), []);
});

test('a non-walkable goal returns null', () => {
  const blockedGoal: Walkability = { isWalkable: (x, y) => !(x === 5 && y === 5) };
  assert.equal(findPath({ x: 0, y: 0 }, { x: 5, y: 5 }, blockedGoal), null);
});

test('a clear path is step-optimal (equal to the Chebyshev distance on a uniform-cost grid)', () => {
  const path = findPath({ x: 0, y: 0 }, { x: 6, y: 4 }, openGrid);
  assert.ok(path, 'a path was found');
  assert.equal(path!.length, Math.max(6, 4), 'diagonal shortcuts make this as short as the longer axis');
});

test('a wall is routed around, not through', () => {
  const path = findPath({ x: 0, y: 0 }, { x: 9, y: 0 }, wallGrid);
  assert.ok(path, 'a path was found despite the wall directly between start and goal');
  let x = 0, y = 0;
  for (const dir of path!) {
    const { dx, dy } = DIRECTION_DELTAS[dir];
    x += dx;
    y += dy;
    assert.ok(wallGrid.isWalkable(x, y), `(${x},${y}) is walkable — the path never crosses the wall`);
  }
  assert.deepEqual([x, y], [9, 0]);
});

test('every step of a found path passes the same isWalkable(x,y,fromX,fromY) check stepMovement itself makes', () => {
  const path = findPath({ x: 0, y: 0 }, { x: 9, y: 0 }, wallGrid);
  assert.ok(path && path.length > 0);
  let x = 0, y = 0;
  for (const dir of path!) {
    const { dx, dy } = DIRECTION_DELTAS[dir];
    const nx = x + dx, ny = y + dy;
    assert.ok(wallGrid.isWalkable(nx, ny, x, y), `step toward ${dir} from (${x},${y}) is one stepMovement would accept`);
    x = nx;
    y = ny;
  }
});

test('a goal on the other side of a full wall is unreachable and returns null quickly', () => {
  assert.equal(findPath({ x: 0, y: 5 }, { x: 9, y: 5 }, splitGrid), null);
});

test('a tiny maxNodes budget gives up on a goal that is otherwise reachable', () => {
  const start = { x: 0, y: 0 };
  const goal = { x: 15, y: 15 };
  assert.ok(findPath(start, goal, openGrid) !== null, 'reachable with the default budget');
  assert.equal(findPath(start, goal, openGrid, { maxNodes: 10 }), null, 'the same goal, but a tiny budget bails out first');
});
