/**
 * Milestone 0 acceptance tests: two independent WebSocket clients against a
 * real server instance on a real port, using the real test map.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  DIRECTION_DELTAS,
  tickMs,
  type Direction,
  type PlayerState,
  type SnapshotMessage,
} from '@thistlevane/shared';
import { startGameServer, type RunningGameServer } from '../src/GameServer';
import { BotClient, sleep } from './helpers/BotClient';

process.env.THISTLEVANE_QUIET = '1';
const assetsDir = fileURLToPath(new URL('../../assets', import.meta.url));
let server: RunningGameServer;
// Tuning comes from the real game-config.json; read after the server loads it.
let TICK_MS: number;
let WALK_TICKS: number;
let RUN_TICKS: number;
let MAX_INPUT_CREDITS: number;
let MAX_MESSAGES_PER_SECOND: number;

before(async () => {
  // Most tests check exact tile positions, so they disable the cosmetic turn-in-place delay.
  // The turn delay has its own test against a second server using the real config.
  server = await startGameServer({
    assetsDir, port: 0, host: '127.0.0.1',
    configOverrides: (c) => { c.movement.turnDelayTicks = 0; },
  });
  const { config } = server.content;
  TICK_MS = tickMs(config.simulation);
  WALK_TICKS = config.movement.walkTicksPerTile;
  RUN_TICKS = config.movement.runTicksPerTile;
  MAX_INPUT_CREDITS = config.network.maxInputCredits;
  MAX_MESSAGES_PER_SECOND = config.network.maxMessagesPerSecond;
  BotClient.wsPath = config.network.wsPath;
});
after(async () => {
  await server.close();
});

const world = () => server.worlds.startZone;
const stateOf = (snap: SnapshotMessage, id: string): PlayerState | undefined => snap.players.find((p) => p.id === id);
const settled = (id: string) => (s: SnapshotMessage) => {
  const p = stateOf(s, id);
  return !!p && p.moveTicksLeft === 0;
};

test('two clients join the same world and each sees the other', async () => {
  const alice = await BotClient.join(server.port, 'Alice');
  const bob = await BotClient.join(server.port, 'Bob');

  await alice.waitFor((m) => m.type === 'playerJoined' && m.player.id === bob.yourId);
  const bobWelcome = await bob.waitFor((m) => m.type === 'welcome');
  assert.ok(bobWelcome.type === 'welcome' && bobWelcome.players.some((p) => p.id === alice.yourId && p.name === 'Alice'));

  const snapA = await alice.nextSnapshot();
  const snapB = await bob.nextSnapshot();
  for (const snap of [snapA, snapB]) {
    assert.ok(stateOf(snap, alice.yourId), 'Alice is in the snapshot');
    assert.ok(stateOf(snap, bob.yourId), 'Bob is in the snapshot');
  }
  // Spawned on different tiles.
  const a = stateOf(snapA, alice.yourId)!;
  const b = stateOf(snapA, bob.yourId)!;
  assert.notDeepEqual([a.tileX, a.tileY], [b.tileX, b.tileY]);

  await alice.close();
  await bob.close();
});

test('movement by one client is seen by the other in real time', async () => {
  const alice = await BotClient.join(server.port, 'Alice');
  const bob = await BotClient.join(server.port, 'Bob');
  const start = stateOf(await bob.nextSnapshot((s) => !!stateOf(s, alice.yourId)), alice.yourId)!;

  // Alice holds "down" for exactly 2 tiles worth of ticks, then releases.
  const lastSeq = await alice.hold('down', WALK_TICKS * 2, TICK_MS);
  await alice.hold(null, 1, TICK_MS);

  // Bob must observe Alice mid-step (smooth movement), then settled 2 tiles down.
  const sawMoving = bob.snapshots().some((s) => (stateOf(s, alice.yourId)?.moveTicksLeft ?? 0) > 0);
  assert.ok(sawMoving, 'Bob saw Alice while she was walking');
  const end = stateOf(await bob.nextSnapshot(settled(alice.yourId)), alice.yourId)!;
  assert.deepEqual([end.tileX, end.tileY, end.facing], [start.tileX, start.tileY + 2, 'down']);

  // Alice's own snapshots acknowledge her inputs.
  const ackSnap = await alice.nextSnapshot((s) => s.ackSeq >= lastSeq);
  assert.ok(ackSnap.ackSeq >= lastSeq);

  // Bob stayed put.
  const bobState = stateOf(await bob.nextSnapshot(), bob.yourId)!;
  assert.equal(bobState.moveTicksLeft, 0);

  await alice.close();
  await bob.close();
});

test('both players can move at the same time independently', async () => {
  const alice = await BotClient.join(server.port, 'Alice');
  const bob = await BotClient.join(server.port, 'Bob');
  const first = await alice.nextSnapshot((s) => !!stateOf(s, bob.yourId));
  const a0 = stateOf(first, alice.yourId)!;
  const b0 = stateOf(first, bob.yourId)!;

  await Promise.all([alice.hold('up', WALK_TICKS, TICK_MS), bob.hold('down', WALK_TICKS, TICK_MS)]);
  await Promise.all([alice.hold(null, 1, TICK_MS), bob.hold(null, 1, TICK_MS)]);

  const snap = await alice.nextSnapshot((s) => settled(alice.yourId)(s) && settled(bob.yourId)(s));
  const a1 = stateOf(snap, alice.yourId)!;
  const b1 = stateOf(snap, bob.yourId)!;
  assert.deepEqual([a1.tileX, a1.tileY], [a0.tileX, a0.tileY - 1]);
  assert.deepEqual([b1.tileX, b1.tileY], [b0.tileX, b0.tileY + 1]);

  await alice.close();
  await bob.close();
});

test('the server blocks walking into walls (server-side collision)', async () => {
  const alice = await BotClient.join(server.port, 'Alice');
  const start = stateOf(await alice.nextSnapshot(), alice.yourId)!;
  const collision = world().map;

  // Find the nearest blocked tile in a straight line from spawn.
  let best: { dir: Direction; free: number } | null = null;
  for (const dir of ['up', 'down', 'left', 'right'] as Direction[]) {
    const { dx, dy } = DIRECTION_DELTAS[dir];
    let free = 0;
    while (collision.isWalkable(start.tileX + dx * (free + 1), start.tileY + dy * (free + 1), start.tileX + dx * free, start.tileY + dy * free) && free < 30) free++;
    if (!best || free < best.free) best = { dir, free };
  }
  assert.ok(best);
  const { dx, dy } = DIRECTION_DELTAS[best.dir];

  // Hold toward the wall for 3 extra tiles' worth of ticks.
  await alice.hold(best.dir, WALK_TICKS * (best.free + 3), TICK_MS);
  await alice.hold(null, 1, TICK_MS);
  const end = stateOf(await alice.nextSnapshot(settled(alice.yourId)), alice.yourId)!;

  assert.deepEqual([end.tileX, end.tileY], [start.tileX + dx * best.free, start.tileY + dy * best.free]);
  for (const snap of alice.snapshots()) {
    const s = stateOf(snap, alice.yourId);
    if (s) assert.ok(collision.isWalkable(s.tileX, s.tileY), `never on a blocked tile (${s.tileX},${s.tileY})`);
  }
  await alice.close();
});

test('flooding inputs does not make a player move faster (speed-hack guard)', async () => {
  const cheater = await BotClient.join(server.port, 'Cheater');
  const start = stateOf(await cheater.nextSnapshot(), cheater.yourId)!;
  const startTick = world().tick;

  // Fire 40 inputs instantly — a legit client would take 2 seconds to send these.
  for (let i = 0; i < 40; i++) cheater.input('left', true);
  await sleep(TICK_MS * 6);
  const snap = await cheater.nextSnapshot();
  const s = stateOf(snap, cheater.yourId)!;

  const elapsedTicks = snap.tick - startTick;
  const maxTicksSimulated = elapsedTicks + MAX_INPUT_CREDITS;
  const maxTiles = Math.ceil(maxTicksSimulated / RUN_TICKS);
  assert.ok(start.tileX - s.tileX <= maxTiles, `moved ${start.tileX - s.tileX} tiles in ${elapsedTicks} ticks`);
  await cheater.close();
});

test('malformed and forged messages are ignored', async () => {
  const alice = await BotClient.join(server.port, 'Alice');
  const start = stateOf(await alice.nextSnapshot(), alice.yourId)!;

  alice.sendRaw('not json at all');
  alice.send({ type: 'teleport', tileX: 1, tileY: 1 });
  alice.send({ type: 'input', seq: 99999, dir: 'diagonal' });
  alice.send({ type: 'snapshot', players: [] });
  alice.send({ type: 'join', name: 'SecondJoin' });
  await sleep(TICK_MS * 4);

  const s = stateOf(await alice.nextSnapshot(), alice.yourId)!;
  assert.deepEqual([s.tileX, s.tileY], [start.tileX, start.tileY]);
  assert.equal(alice.socket.readyState, alice.socket.OPEN);
  assert.equal([...world().players.values()].filter((p) => p.name === 'SecondJoin').length, 0);
  await alice.close();
});

test('names are sanitized', async () => {
  const bot = await BotClient.join(server.port, '<img src=x onerror=alert(1)>');
  const welcome = await bot.waitFor((m) => m.type === 'welcome');
  assert.ok(welcome.type === 'welcome');
  const me = welcome.players.find((p) => p.id === bot.yourId)!;
  assert.match(me.name, /^[\p{L}\p{N} _-]+$/u);
  assert.ok(me.name.length <= server.content.config.players.maxNameLength);
  await bot.close();
});

test('oversized messages and message floods disconnect the client', async () => {
  const big = await BotClient.join(server.port, 'Big');
  big.sendRaw(JSON.stringify({ type: 'join', name: 'x'.repeat(5000) }));
  assert.equal(await big.waitForClose(), 1009);

  const spammer = await BotClient.join(server.port, 'Spam');
  for (let i = 0; i < MAX_MESSAGES_PER_SECOND + 10; i++) spammer.sendRaw('{}');
  assert.equal(await spammer.waitForClose(), 1008);
});

test('disconnecting removes the player for everyone else', async () => {
  const alice = await BotClient.join(server.port, 'Alice');
  const bob = await BotClient.join(server.port, 'Bob');
  await alice.nextSnapshot((s) => !!stateOf(s, bob.yourId));
  const bobId = bob.yourId;

  await bob.close();
  await alice.waitFor((m) => m.type === 'playerLeft' && m.id === bobId);
  const snap = await alice.nextSnapshot();
  assert.equal(stateOf(snap, bobId), undefined);
  assert.equal(world().players.has(bobId), false);
  await alice.close();
});

test('a half-finished step completes when the client goes silent', async () => {
  const alice = await BotClient.join(server.port, 'Alice');
  const start = stateOf(await alice.nextSnapshot(), alice.yourId)!;
  const dir: Direction = world().map.isWalkable(start.tileX, start.tileY + 1, start.tileX, start.tileY) ? 'down' : 'up';
  const seq = alice.input(dir); // one tick only, then silence (like a backgrounded tab)
  const end = stateOf(
    await alice.nextSnapshot((s) => s.ackSeq >= seq && settled(alice.yourId)(s)),
    alice.yourId,
  )!;
  assert.equal(end.tileY, start.tileY + DIRECTION_DELTAS[dir].dy);
  await alice.close();
});

test('players block each other on the server', async () => {
  const alice = await BotClient.join(server.port, 'Alice');
  const bob = await BotClient.join(server.port, 'Bob');
  const first = await alice.nextSnapshot((s) => !!stateOf(s, bob.yourId));
  const a0 = stateOf(first, alice.yourId)!;
  const b0 = stateOf(first, bob.yourId)!;
  // Spawned next to each other: find the direction from Alice to Bob.
  const dir = (Object.keys(DIRECTION_DELTAS) as Direction[]).find(
    (d) => a0.tileX + DIRECTION_DELTAS[d].dx === b0.tileX && a0.tileY + DIRECTION_DELTAS[d].dy === b0.tileY,
  );
  assert.ok(dir, 'players spawn on adjacent tiles');

  await alice.hold(dir, WALK_TICKS * 2, TICK_MS);
  await alice.hold(null, 1, TICK_MS);
  const snap = await alice.nextSnapshot(settled(alice.yourId));
  const a1 = stateOf(snap, alice.yourId)!;
  assert.deepEqual([a1.tileX, a1.tileY, a1.facing], [a0.tileX, a0.tileY, dir], 'Alice turned but could not walk into Bob');
  for (const s of alice.snapshots()) {
    const a = stateOf(s, alice.yourId);
    const b = stateOf(s, bob.yourId);
    if (a && b) assert.notDeepEqual([a.tileX, a.tileY], [b.tileX, b.tileY], 'never share a tile');
  }
  await alice.close();
  await bob.close();
});

test('running is faster than walking and validated by the server', async () => {
  const alice = await BotClient.join(server.port, 'Runner');
  const start = stateOf(await alice.nextSnapshot(), alice.yourId)!;
  const dir: Direction = world().map.isWalkable(start.tileX, start.tileY + 3, start.tileX, start.tileY + 2) && world().map.isWalkable(start.tileX, start.tileY + 1, start.tileX, start.tileY) ? 'down' : 'up';
  await alice.hold(dir, RUN_TICKS * 3, TICK_MS, true);
  await alice.hold(null, 1, TICK_MS);
  const end = stateOf(await alice.nextSnapshot(settled(alice.yourId)), alice.yourId)!;
  assert.equal(Math.abs(end.tileY - start.tileY), 3);
  assert.ok(alice.snapshots().some((s) => stateOf(s, alice.yourId)?.gait === 'run'));
  await alice.close();
});

test('turn-in-place delay from the real config: a tap turns without stepping', async () => {
  const real = await startGameServer({ assetsDir, port: 0, host: '127.0.0.1' });
  const delay = real.content.config.movement.turnDelayTicks;
  try {
    const bot = await BotClient.join(real.port, 'Turner');
    const start = stateOf(await bot.nextSnapshot(), bot.yourId)!;
    const dir: Direction = start.facing === 'left' ? 'right' : 'left';
    const seq = bot.input(dir); // a single-tick tap
    const s = await bot.nextSnapshot((m) => m.ackSeq >= seq);
    const after = stateOf(s, bot.yourId)!;
    assert.equal(after.facing, dir);
    if (delay > 0) assert.deepEqual([after.tileX, after.tileY], [start.tileX, start.tileY]);
    await bot.close();
  } finally {
    await real.close();
  }
});

test('mobs exist, wander, and never overlap players or blocked tiles', async () => {
  const w = world();
  assert.ok(w.mobs.size > 0, 'start zone has mobs');
  const before = new Map([...w.mobs.values()].map((m) => [m.id, `${m.state.tileX},${m.state.tileY}`]));
  await sleep(TICK_MS * 60);
  let moved = 0;
  for (const m of w.mobs.values()) {
    if (before.get(m.id) !== `${m.state.tileX},${m.state.tileY}`) moved++;
    assert.ok(w.map.isWalkable(m.state.tileX, m.state.tileY), 'mob stands on walkable tile');
    assert.ok(m.state.tileX >= m.home.x && m.state.tileX < m.home.x + m.home.w, 'mob stays in its region (x)');
    assert.ok(m.state.tileY >= m.home.y && m.state.tileY < m.home.y + m.home.h, 'mob stays in its region (y)');
  }
  assert.ok(moved > 0, 'some mobs wandered within 3 seconds');
  // no two mobs share a tile
  const tiles = new Set<string>();
  for (const m of w.mobs.values()) {
    const key = `${m.state.tileX},${m.state.tileY}`;
    assert.ok(!tiles.has(key), 'mobs do not overlap');
    tiles.add(key);
  }
});

test('snapshots only contain entities within the interest radius', async () => {
  const alice = await BotClient.join(server.port, 'Alice');
  const radius = server.content.config.network.interestRadiusTiles;
  const snap = await alice.nextSnapshot();
  const me = stateOf(snap, alice.yourId)!;
  assert.ok(snap.mobs.length > 0, 'there are mobs near the spawn');
  for (const m of snap.mobs) {
    assert.ok(Math.abs(m.tileX - me.tileX) <= radius && Math.abs(m.tileY - me.tileY) <= radius, 'mob within radius');
    assert.ok(server.content.mobs.mobs[m.kind], `mob kind "${m.kind}" is defined`);
  }
  assert.ok(snap.mobs.length < world().mobs.size, 'not every mob of the zone is sent');
  await alice.close();
});

test('walking onto a portal moves the player to the target zone', async () => {
  const alice = await BotClient.join(server.port, 'Traveller');
  const w = world();
  const portal = w.map.portals[0]!;
  const player = w.players.get(alice.yourId)!;
  // Teleport next to the portal (test-only shortcut; walking 250 tiles would take minutes).
  const sideX = portal.x - 1, sideY = portal.y;
  assert.ok(w.map.isWalkable(sideX, sideY), 'tile west of the portal is walkable');
  player.resetAt(sideX, sideY, server.content.config.movement);
  await alice.hold('right', WALK_TICKS + 2, TICK_MS);
  await alice.hold(null, 1, TICK_MS);
  const change = await alice.waitFor((m) => m.type === 'zoneChange', 4000);
  assert.ok(change.type === 'zoneChange');
  assert.equal(change.zoneId, portal.targetZone);
  const me = change.states.find((s) => s.id === alice.yourId)!;
  const target = server.worlds.zone(portal.targetZone)!;
  const spawn = target.map.spawnByName(portal.targetSpawn)!;
  assert.ok(Math.abs(me.tileX - spawn.tileX) <= 2 && Math.abs(me.tileY - spawn.tileY) <= 2, 'arrived at the target spawn');
  assert.equal(w.players.has(alice.yourId), false, 'left the old zone');
  assert.equal(target.players.has(alice.yourId), true, 'present in the new zone');
  // snapshots now describe the new zone
  const snap = await alice.nextSnapshot((s) => !!stateOf(s, alice.yourId));
  assert.ok(stateOf(snap, alice.yourId));
  await alice.close();
});
