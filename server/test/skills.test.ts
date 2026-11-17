/**
 * Server-authoritative skill-cast acceptance tests: real WebSocket clients against a real
 * server instance, same pattern as combat.test.ts. Mobs are picked fresh per test so one
 * test's damage/aggro never leaks into another's assertions.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { tickMs, type Direction } from '@thistlevane/shared';
import { startGameServer, type RunningGameServer } from '../src/GameServer';
import type { Mob } from '../src/world/Mob';
import type { World } from '../src/world/World';
import { BotClient } from './helpers/BotClient';

process.env.THISTLEVANE_QUIET = '1';
const assetsDir = fileURLToPath(new URL('../../assets', import.meta.url));
let server: RunningGameServer;
let TICK_MS: number;

before(async () => {
  server = await startGameServer({ assetsDir, port: 0, host: '127.0.0.1' });
  TICK_MS = tickMs(server.content.config.simulation);
  BotClient.wsPath = server.content.config.network.wsPath;
});
after(async () => {
  await server.close();
});

const world = () => server.worlds.startZone;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const usedMobIds = new Set<string>();
function freshMob(w: World): Mob {
  const found = [...w.mobs.values()].find((m) => !usedMobIds.has(m.id));
  if (!found) throw new Error('no fresh mob available for this test');
  for (const m of w.mobs.values()) if (m.home === found.home) usedMobIds.add(m.id);
  return found;
}

/** A walkable tile one cardinal step from the mob, with the direction back toward it. */
function adjacentTo(w: World, mob: Mob): { x: number; y: number; aim: Direction } {
  const candidates: Array<{ dx: number; dy: number; aim: Direction }> = [
    { dx: 0, dy: -1, aim: 'down' }, { dx: 0, dy: 1, aim: 'up' },
    { dx: -1, dy: 0, aim: 'right' }, { dx: 1, dy: 0, aim: 'left' },
  ];
  for (const c of candidates) {
    const x = mob.state.tileX + c.dx, y = mob.state.tileY + c.dy;
    if (w.map.isWalkable(x, y)) return { x, y, aim: c.aim };
  }
  throw new Error('mob has no walkable adjacent tile');
}

test('a skill cast is gated by unlock level, then damages, deducts resource, and respects its own cooldown', async () => {
  const monk = await BotClient.join(server.port, 'Monky', 'monk');
  const w = world();
  const mob = freshMob(w);
  const player = w.players.get(monk.yourId)!;
  const spot = adjacentTo(w, mob);
  player.resetAt(spot.x, spot.y, server.content.config.movement);
  mob.state.hp = 1_000_000; // generous HP pool so repeated casts never kill it mid-test
  const startHp = mob.state.hp;

  // monk_rising_crane unlocks at level 3; a fresh level-1 player casting it is silently ignored.
  monk.cast('monk_rising_crane', spot.aim, mob.id);
  await sleep(TICK_MS * 10);
  assert.equal(mob.state.hp, startHp, 'not unlocked yet: no damage');
  assert.equal(player.resourceCurrent, 100, 'not unlocked yet: resource untouched');
  assert.ok(
    !monk.snapshots().some((s) => s.events.some((e) => e.kind === 'cast' && e.skillId === 'monk_rising_crane')),
    'not unlocked yet: no cast event broadcast either',
  );

  // Simulate having reached level 3 (direct state poke — same pattern existing tests use via resetAt).
  player.level = 3;

  const castTick1 = w.tick;
  monk.cast('monk_rising_crane', spot.aim, mob.id);
  const hit1 = await monk.nextSnapshot((s) => s.events.some((e) => e.kind === 'hit' && e.targetId === mob.id));
  const dmg1 = hit1.events.find((e) => e.kind === 'hit' && e.targetId === mob.id)!;
  assert.ok((dmg1.damage ?? 0) > 0, 'unlocked: the cast actually damages the mob');
  assert.ok(
    hit1.events.some((e) => e.kind === 'cast' && e.sourceId === monk.yourId && e.skillId === 'monk_rising_crane'),
    'a cast event is broadcast alongside the hit, carrying the skill id',
  );
  assert.equal(player.resourceCurrent, 91, 'resource_cost (9) was deducted from the 100 starting pool');

  // Still on cooldown (4s): an immediate second cast must not land a second hit.
  monk.cast('monk_rising_crane', spot.aim, mob.id);
  await sleep(TICK_MS * 10);
  const hitsSoFar = monk.snapshots().flatMap((s) => s.events.filter((e) => e.kind === 'hit' && e.targetId === mob.id));
  assert.equal(hitsSoFar.length, 1, 'still on cooldown: the second cast was dropped, not a second hit');

  // Wait out the cooldown by polling the server's own authoritative clock (not a guessed sleep
  // duration from send-time — under load, the gap between sending a cast and the server actually
  // processing it can be several ticks, so anchoring off send-time undershoots the real wait).
  const cooldownTicks = Math.round(4 * server.content.config.simulation.tickRate);
  while (w.tick - (player.skillCooldowns.get('monk_rising_crane') ?? -Infinity) < cooldownTicks) {
    await sleep(TICK_MS);
  }
  monk.cast('monk_rising_crane', spot.aim, mob.id);
  await monk.nextSnapshot(() => monk.snapshots().flatMap((s) => s.events.filter((e) => e.kind === 'hit' && e.targetId === mob.id)).length >= 2);
  const finalHits = monk.snapshots().flatMap((s) => s.events.filter((e) => e.kind === 'hit' && e.targetId === mob.id));
  assert.equal(finalHits.length, 2, 'off cooldown: a third attempt lands a second hit');

  await monk.close();
});

test('a locked target is always the one hit, not whichever same-position mob happens to be checked first', async () => {
  const monk = await BotClient.join(server.port, 'Precise', 'monk');
  const w = world();
  const mobA = freshMob(w); // earlier in iteration order — never targeted
  const mobB = freshMob(w); // later in iteration order — the one explicitly locked
  const pos = { x: mobA.state.tileX, y: mobA.state.tileY };
  for (const m of [mobA, mobB]) {
    m.state.hp = 1_000_000;
    m.state.tileX = pos.x; m.state.tileY = pos.y; m.state.fromX = pos.x; m.state.fromY = pos.y;
  }
  const spot = adjacentTo(w, mobA);
  const player = w.players.get(monk.yourId)!;
  player.resetAt(spot.x, spot.y, server.content.config.movement);
  player.level = 3;

  // Both mobs sit at the identical spot, so a plain geometric scan (old behaviour before free-aim
  // targeting) would hit whichever one the server checks first, regardless of targetId.
  monk.cast('monk_rising_crane', spot.aim, mobB.id);
  await monk.nextSnapshot((s) => s.events.some((e) => e.kind === 'hit'));
  const hits = monk.snapshots().flatMap((s) => s.events.filter((e) => e.kind === 'hit'));
  assert.ok(hits.some((e) => e.targetId === mobB.id), 'the explicitly locked target is hit');
  assert.ok(!hits.some((e) => e.targetId === mobA.id), 'the other same-position mob is never hit instead');

  await monk.close();
});

test('an area skill hits every enemy within its own radius of the target, not just whatever is near the caster', async () => {
  const monk = await BotClient.join(server.port, 'Blaster', 'monk');
  const w = world();
  const center = freshMob(w);
  const clusterMate = freshMob(w); // stands right next to `center` — should be caught in the same blast
  const farAway = freshMob(w); // nowhere near `center` — must NOT be caught, even though AoE is active
  const pos = { x: center.state.tileX, y: center.state.tileY };
  for (const m of [center, clusterMate]) {
    m.state.hp = 1_000_000;
    m.state.tileX = pos.x; m.state.tileY = pos.y; m.state.fromX = pos.x; m.state.fromY = pos.y;
  }
  farAway.state.hp = 1_000_000;
  farAway.state.tileX = pos.x + 100; farAway.state.tileY = pos.y + 100;
  farAway.state.fromX = farAway.state.tileX; farAway.state.fromY = farAway.state.tileY;

  const spot = adjacentTo(w, center);
  const player = w.players.get(monk.yourId)!;
  player.resetAt(spot.x, spot.y, server.content.config.movement);
  player.level = 34; // monk_hundred_hands (area_enemy, radius 4.5) unlocks here

  monk.cast('monk_hundred_hands', spot.aim, center.id);
  await monk.nextSnapshot(() => monk.snapshots().flatMap((s) => s.events.filter((e) => e.kind === 'hit')).length >= 2);
  const hits = monk.snapshots().flatMap((s) => s.events.filter((e) => e.kind === 'hit'));
  assert.ok(hits.some((e) => e.targetId === center.id), 'the targeted mob is hit');
  assert.ok(hits.some((e) => e.targetId === clusterMate.id), 'its cluster-mate, within blast radius, is hit too');
  assert.ok(!hits.some((e) => e.targetId === farAway.id), 'a mob far outside the blast radius is never hit');

  await monk.close();
});

test('a heal-targeted skill heals rather than damages', async () => {
  const dawn = await BotClient.join(server.port, 'Healy', 'dawnkeeper');
  const w = world();
  const player = w.players.get(dawn.yourId)!;
  player.state.hp = Math.max(1, Math.round(player.combat.maxHp * 0.5));

  // dawnkeeper's level-1 kit has no heal; lay_on_hands unlocks later — poke level directly like above.
  player.level = 100;
  const beforeHp = player.state.hp;
  dawn.cast('dawnkeeper_lay_on_hands', 'down', dawn.yourId);
  const snap = await dawn.nextSnapshot((s) => s.events.some((e) => e.kind === 'heal' && e.targetId === dawn.yourId));
  const heal = snap.events.find((e) => e.kind === 'heal')!;
  assert.ok((heal.healing ?? 0) > 0, 'a heal event with a positive amount is broadcast');
  assert.ok(player.state.hp > beforeHp, 'the caster was actually healed, not damaged');
  assert.ok(player.state.hp <= player.combat.maxHp, 'healing never overshoots max hp');

  await dawn.close();
});
