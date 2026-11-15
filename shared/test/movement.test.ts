import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MapModel,
  PlayerAwareWalkability,
  createPlayerState,
  parseClientMessage,
  sanitizeName,
  stepMovement,
  tilePosition,
  validateCharacters,
  validateEffects,
  validateGameConfig,
  validateMobs,
  validateZones,
  type MovementRules,
  type PlayerState,
  type TiledMapJson,
  type Walkability,
} from '../src/index';

// Test fixtures (deliberately independent of the game's real tuning).
const rules: MovementRules = { walkTicksPerTile: 5, runTicksPerTile: 3, turnDelayTicks: 2, playersBlockEachOther: true };
const noTurnDelay: MovementRules = { ...rules, turnDelayTicks: 0 };

// 5x3 grid, wall at (3,1)
const grid: Walkability = {
  isWalkable: (x, y) => x >= 0 && y >= 0 && x < 5 && y < 3 && !(x === 3 && y === 1),
};
const walk = (dir: PlayerState['facing'] | null) => ({ dir, run: false });
const run = (dir: PlayerState['facing'] | null) => ({ dir, run: true });

function player(x: number, y: number, facing: PlayerState['facing'] = 'right'): PlayerState {
  return { ...createPlayerState('p', x, y, rules), facing };
}

test('one walking step takes walkTicksPerTile ticks and moves smoothly', () => {
  const p = player(0, 0);
  stepMovement(p, walk('right'), grid, rules);
  assert.deepEqual([p.tileX, p.moveTicksLeft, p.gait], [1, rules.walkTicksPerTile, 'walk']);
  for (let i = 1; i <= rules.walkTicksPerTile; i++) {
    stepMovement(p, walk(null), grid, rules);
    assert.ok(Math.abs(tilePosition(p).x - i / rules.walkTicksPerTile) < 1e-9);
  }
  assert.deepEqual([p.fromX, p.tileX, p.moveTicksLeft], [1, 1, 0]);
});

test('running uses runTicksPerTile', () => {
  const p = player(0, 0);
  stepMovement(p, run('right'), grid, rules);
  assert.deepEqual([p.gait, p.stepTicks, p.moveTicksLeft], ['run', rules.runTicksPerTile, rules.runTicksPerTile]);
});

test('holding a direction chains steps at constant speed', () => {
  const p = player(0, 0);
  const xs: number[] = [];
  for (let i = 0; i < rules.walkTicksPerTile * 2 + 1; i++) {
    stepMovement(p, walk('right'), grid, rules);
    xs.push(tilePosition(p).x);
  }
  for (let i = 1; i < xs.length; i++) assert.ok(Math.abs(xs[i]! - xs[i - 1]! - 1 / rules.walkTicksPerTile) < 1e-9);
});

test('from a standstill a new direction turns first; a tap only turns', () => {
  const p = player(1, 1, 'right');
  assert.equal(stepMovement(p, walk('down'), grid, rules).kind, 'turned');
  assert.deepEqual([p.facing, p.tileY], ['down', 1]);
  stepMovement(p, walk(null), grid, rules); // released: tap = turn only
  assert.equal(p.tileY, 1);

  const q = player(1, 1, 'right');
  stepMovement(q, walk('down'), grid, rules); // turn
  for (let i = 0; i < rules.turnDelayTicks - 1; i++) stepMovement(q, walk('down'), grid, rules);
  assert.equal(q.moveTicksLeft, 0, 'still waiting for turn delay');
  stepMovement(q, walk('down'), grid, rules);
  assert.equal(q.tileY, 2, 'held long enough: walks');
});

test('changing direction while walking does not add a turn delay', () => {
  const p = player(0, 0, 'right');
  for (let i = 0; i < rules.walkTicksPerTile; i++) stepMovement(p, walk('right'), grid, rules);
  const outcome = stepMovement(p, walk('down'), grid, rules); // arrives and immediately turns + steps
  assert.equal(outcome.kind, 'started');
  assert.deepEqual([p.tileX, p.tileY], [1, 1]);
});

test('direction changes mid-step wait for the tile boundary', () => {
  const p = player(0, 0);
  stepMovement(p, walk('right'), grid, rules);
  stepMovement(p, walk('down'), grid, rules);
  assert.deepEqual([p.facing, p.tileX, p.tileY], ['right', 1, 0]);
});

test('walls and edges block movement and report the blocked tile', () => {
  const p = player(2, 1, 'right');
  assert.deepEqual(stepMovement(p, walk('right'), grid, rules), { kind: 'blocked', tileX: 3, tileY: 1 });
  assert.deepEqual([p.tileX, p.moveTicksLeft], [2, 0]);
});

test('players block each other, including the tile a walker is leaving', () => {
  const a = player(0, 0, 'right');
  const b = player(2, 0, 'left');
  const world = (self: PlayerState) => new PlayerAwareWalkability(grid, () => [a, b], self.id, noTurnDelay);
  a.id = 'a';
  b.id = 'b';
  stepMovement(a, walk('right'), world(a), noTurnDelay); // a: 0 → 1
  assert.equal(stepMovement(b, walk('left'), world(b), noTurnDelay).kind, 'blocked'); // 1 is reserved
  const c = { ...player(1, 1, 'up'), id: 'c' };
  const w = new PlayerAwareWalkability(grid, () => [a, b, c], 'c', noTurnDelay);
  stepMovement(c, walk('up'), w, noTurnDelay);
  assert.equal(c.tileY, 1, 'cannot enter a tile someone is walking into');

  const loose = { ...noTurnDelay, playersBlockEachOther: false };
  const w2 = new PlayerAwareWalkability(grid, () => [a, b], 'b', loose);
  assert.equal(stepMovement(b, walk('left'), w2, loose).kind, 'started');
});

test('parseClientMessage rejects malformed input', () => {
  assert.equal(parseClientMessage('not json'), null);
  assert.equal(parseClientMessage('{"type":"input","seq":-1,"dir":"up"}'), null);
  assert.equal(parseClientMessage('{"type":"input","seq":1,"dir":"north"}'), null);
  assert.equal(parseClientMessage('{"type":"input","seq":1,"dir":"up","run":"yes"}'), null);
  assert.equal(parseClientMessage('{"type":"teleport","x":5}'), null);
  assert.deepEqual(parseClientMessage('{"type":"input","seq":3,"dir":null}'), { type: 'input', seq: 3, dir: null, run: false });
});

test('sanitizeName strips markup and limits length', () => {
  assert.equal(sanitizeName('<script>alert(1)</script>', 16, 'X'), 'scriptalert1scri');
  assert.equal(sanitizeName('   ', 16, 'Wanderer'), 'Wanderer');
});

// ---------- the real content files must be valid ----------
const assets = new URL('../../assets/', import.meta.url);
const readJson = (rel: string) => JSON.parse(readFileSync(new URL(rel, assets), 'utf8'));

test('real content files pass validation', () => {
  const config = validateGameConfig(readJson('data/game-config.json'));
  const zones = validateZones(readJson('data/zones.json'));
  validateCharacters(readJson('data/characters.json'));
  validateMobs(readJson('data/mobs.json'));
  validateEffects(readJson('data/effects.json'));
  assert.ok(zones.zones[config.world.startZone], 'start zone is registered');
});

test('every zone map: collision from tile properties, elevation rule, portals and spawns', () => {
  const config = validateGameConfig(readJson('data/game-config.json'));
  const zones = validateZones(readJson('data/zones.json'));
  const mobs = validateMobs(readJson('data/mobs.json'));
  for (const [zoneId, zone] of Object.entries(zones.zones)) {
    const json = readJson(zone.file) as TiledMapJson;
    const map = new MapModel(json, config.world.layers);
    assert.ok(map.spawnByName('center'), `${zoneId}: has a center spawn`);
    assert.ok(map.portals.length > 0, `${zoneId}: has portals`);
    for (const p of map.portals) {
      assert.ok(zones.zones[p.targetZone], `${zoneId}: portal target ${p.targetZone} exists`);
      const target = new MapModel(readJson(zones.zones[p.targetZone]!.file) as TiledMapJson, config.world.layers);
      assert.ok(target.spawnByName(p.targetSpawn), `${zoneId}: portal spawn ${p.targetSpawn} exists in ${p.targetZone}`);
      // the portal itself must be reachable: at least one walkable cell
      let walkable = 0;
      for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (map.isWalkable(x, y)) walkable++;
      assert.ok(walkable > 0, `${zoneId}: portal ${p.name} is walkable`);
    }
    for (const m of map.mobSpawns) assert.ok(mobs.mobs[m.mob], `${zoneId}: mob ${m.mob} defined`);
    if (zone.difficulty !== 'safe' && zone.difficulty !== 'easy') assert.ok(map.mobSpawns.length > 0, `${zoneId}: has mob spawns`);

    // collides / walkable tile properties are honoured
    let colliding = 0, levelSteps = 0, rampsOk = 0;
    for (const layer of map.tileLayers) {
      layer.data.forEach((gid, i) => {
        if (gid && map.tileProperty(gid, 'collides') === true) {
          const x = i % map.width, y = Math.floor(i / map.width);
          const overridden = map.gidsAt(x, y).some((e) => map.tileProperty(e.gid, 'walkable') === true);
          if (!overridden) assert.equal(map.isWalkable(x, y), false);
          colliding++;
        }
      });
    }
    const collisionLayer = map.tileLayers.find(l => l.name === config.world.layers.collision);
    const collisionLayerBlocks = collisionLayer ? collisionLayer.data.filter(g => g !== 0).length : 0;
    assert.ok(colliding > 0 || collisionLayerBlocks > 0, `${zoneId}: has colliding tiles`);
    // elevation: stepping between different levels is only allowed via ramps
    for (let y = 1; y < map.height; y++) for (let x = 1; x < map.width; x++) {
      const la = map.levelAt(x, y), lb = map.levelAt(x - 1, y);
      if (la !== lb && map.isWalkable(x, y) && map.isWalkable(x - 1, y)) {
        levelSteps++;
        const allowed = map.isWalkable(x, y, x - 1, y);
        assert.equal(allowed, map.isRamp(x, y) || map.isRamp(x - 1, y), `${zoneId}: level change at ${x},${y} only via ramp`);
        if (allowed) rampsOk++;
      }
    }
    if (levelSteps > 0) {
      assert.ok(rampsOk > 0, `${zoneId}: has usable ramps`);
    }
    assert.equal(map.isWalkable(-1, 0), false);
  }
});

test('invalid config is rejected with a helpful message', () => {
  const config = readJson('data/game-config.json');
  config.movement.walkTicksPerTile = 0;
  assert.throws(() => validateGameConfig(config), /movement\.walkTicksPerTile/);
});
