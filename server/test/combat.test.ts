/**
 * Server-authoritative combat acceptance tests: real WebSocket clients against
 * a real server instance, same pattern as multiplayer.test.ts (BotClient).
 * Mobs are picked fresh per test (never reused) so one test's effect on a mob
 * (damage, aggro, death) can never leak into another test's assertions.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { hasLineOfSight, tickMs, type Direction } from '@thistlevane/shared';
import { startGameServer, type RunningGameServer } from '../src/GameServer';
import type { Mob } from '../src/world/Mob';
import type { World } from '../src/world/World';
import { BotClient } from './helpers/BotClient';

process.env.THISTLEVANE_QUIET = '1';
const assetsDir = fileURLToPath(new URL('../../assets', import.meta.url));
let server: RunningGameServer;
let TICK_MS: number;
let TICK_RATE: number;

before(async () => {
  server = await startGameServer({ assetsDir, port: 0, host: '127.0.0.1' });
  const { config } = server.content;
  TICK_MS = tickMs(config.simulation);
  TICK_RATE = config.simulation.tickRate;
  BotClient.wsPath = config.network.wsPath;
});
after(async () => {
  await server.close();
});

const world = () => server.worlds.startZone;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Picks a melee-weapon mob (slime, in the start zone) that no earlier test has touched —
 * and quarantines its whole spawn-region siblings too, since they share a home rect close
 * enough together that engaging one can bystander-aggro its neighbors (observed directly:
 * placing a player next to one slime drew an 'aggro' event from a second, unselected one).
 */
const usedMobIds = new Set<string>();
function freshMeleeMob(w: World): Mob {
  const found = [...w.mobs.values()].find((m) => m.def.weapon?.kind === 'melee' && !usedMobIds.has(m.id));
  if (!found) throw new Error('no fresh melee-weapon mob available for this test — add more slimes to the fixture');
  for (const m of w.mobs.values()) if (m.home === found.home) usedMobIds.add(m.id);
  return found;
}

/** Walkable tiles `distance` tiles away from a mob on each cardinal axis, with the direction back toward it. */
function cardinalOffsets(w: World, mob: Mob, distance: number): Array<{ x: number; y: number; aim: Direction }> {
  const candidates: Array<{ dx: number; dy: number; aim: Direction }> = [
    { dx: 0, dy: -distance, aim: 'down' },
    { dx: 0, dy: distance, aim: 'up' },
    { dx: -distance, dy: 0, aim: 'right' },
    { dx: distance, dy: 0, aim: 'left' },
  ];
  return candidates
    .map((c) => ({ x: mob.state.tileX + c.dx, y: mob.state.tileY + c.dy, aim: c.aim }))
    .filter((c) => w.map.isWalkable(c.x, c.y));
}

test('a melee attack lands on a mob and a second, independent client sees the same resulting hp', async () => {
  const alice = await BotClient.join(server.port, 'Alice');
  const bob = await BotClient.join(server.port, 'Bob');
  await bob.nextSnapshot((s) => !!s.players.find((p) => p.id === alice.yourId));

  const w = world();
  const mob = freshMeleeMob(w);
  const player = w.players.get(alice.yourId)!;
  const bobPlayer = w.players.get(bob.yourId)!;
  const spots = cardinalOffsets(w, mob, 1);
  player.resetAt(spots[0]!.x, spots[0]!.y, server.content.config.movement);
  // Bob must also be near the mob (within interest radius) to independently observe it.
  bobPlayer.resetAt(mob.state.tileX, mob.state.tileY - 2, server.content.config.movement);
  const startHp = mob.state.hp;

  alice.attack(spots[0]!.aim);
  const aliceSnap = await alice.nextSnapshot((s) => s.events.some((e) => e.kind === 'hit' && e.sourceId === alice.yourId && e.targetId === mob.id));
  const hitEvent = aliceSnap.events.find((e) => e.kind === 'hit' && e.targetId === mob.id)!;
  assert.ok((hitEvent.damage ?? 0) > 0, 'damage was dealt');
  assert.equal(mob.state.hp, startHp - (hitEvent.damage ?? 0), "server's own mob hp matches the reported damage");

  const bobSnap = await bob.nextSnapshot((s) => s.mobs.some((m) => m.id === mob.id && m.hp === mob.state.hp));
  assert.ok(bobSnap.mobs.some((m) => m.id === mob.id), 'the second client independently observes the same resulting hp');

  await alice.close();
  await bob.close();
});

test('two players attacking the same mob at the same time each land exactly one hit, never duplicated', async () => {
  const alice = await BotClient.join(server.port, 'Alice');
  const bob = await BotClient.join(server.port, 'Bob');
  await bob.nextSnapshot((s) => !!s.players.find((p) => p.id === alice.yourId));

  const w = world();
  const mob = freshMeleeMob(w);
  const aliceP = w.players.get(alice.yourId)!;
  const bobP = w.players.get(bob.yourId)!;
  const spots = cardinalOffsets(w, mob, 1);
  assert.ok(spots.length >= 2, 'mob has at least two free adjacent tiles');
  aliceP.resetAt(spots[0]!.x, spots[0]!.y, server.content.config.movement);
  bobP.resetAt(spots[1]!.x, spots[1]!.y, server.content.config.movement);

  alice.attack(spots[0]!.aim);
  bob.attack(spots[1]!.aim);
  await sleep(TICK_MS * 4);

  const countHits = (bot: BotClient, sourceId: string) =>
    bot.snapshots().flatMap((s) => s.events.filter((e) => e.kind === 'hit' && e.sourceId === sourceId && e.targetId === mob.id)).length;
  assert.equal(countHits(alice, alice.yourId), 1, "Alice's attack landed exactly once");
  assert.equal(countHits(alice, bob.yourId), 1, "Bob's attack (seen by Alice too) landed exactly once, not duplicated");

  await alice.close();
  await bob.close();
});

test('a mob detects and aggroes a nearby player, then gives up and returns home once it leaves', async () => {
  const alice = await BotClient.join(server.port, 'Alice');
  const w = world();
  const mob = freshMeleeMob(w);
  const player = w.players.get(alice.yourId)!;
  assert.equal(mob.aiStateName, 'wander');

  const spot = cardinalOffsets(w, mob, 2)[0]!;
  player.resetAt(spot.x, spot.y, server.content.config.movement);
  await sleep(TICK_MS * 6);
  assert.notEqual(mob.aiStateName, 'wander', 'the mob noticed the player and left wander');

  player.resetAt(1, 1, server.content.config.movement); // far outside detection range
  await sleep(TICK_MS * 90);
  assert.equal(mob.aiStateName, 'wander', 'the mob gave up the chase and returned home');

  await alice.close();
});

test('a mob only damages a player once in attack range, and respects its cooldown between hits', async () => {
  const alice = await BotClient.join(server.port, 'Alice');
  const w = world();
  const mob = freshMeleeMob(w);
  const player = w.players.get(alice.yourId)!;
  const weapon = mob.def.weapon!;
  const aggro = mob.def.aggro!;
  const startHp = player.state.hp;

  // Within detection but outside attack range: must chase without ever hitting.
  const far = cardinalOffsets(w, mob, Math.ceil(weapon.rangeTiles) + 2)[0]!;
  player.resetAt(far.x, far.y, server.content.config.movement);
  await sleep(TICK_MS * 2);
  assert.equal(player.state.hp, startHp, 'no damage while still outside the weapon range');
  assert.notEqual(mob.aiStateName, 'wander', 'the mob is chasing');

  // Walk it into range and let it swing at least twice.
  const near = cardinalOffsets(w, mob, 1)[0]!;
  player.resetAt(near.x, near.y, server.content.config.movement);
  const ticksForTwoHits = aggro.attackWindupTicks + weapon.cooldownTicks * 2 + 20;
  await sleep(TICK_MS * ticksForTwoHits);

  const hitTicks = alice
    .snapshots()
    .flatMap((s) => (s.events.some((e) => e.kind === 'hit' && e.sourceId === mob.id && e.targetId === alice.yourId) ? [s.tick] : []))
    .sort((a, b) => a - b);
  assert.ok(hitTicks.length >= 2, `expected at least two hits in ${ticksForTwoHits} ticks, got ${hitTicks.length}`);
  for (let i = 1; i < hitTicks.length; i++) {
    assert.ok(hitTicks[i]! - hitTicks[i - 1]! >= weapon.cooldownTicks, 'consecutive hits are spaced at least one cooldown apart');
  }

  await alice.close();
});

test('a ranged attack travels and only resolves after its flight time, not instantly', async () => {
  const ranger = await BotClient.join(server.port, 'Shooter', 'ranger');
  const w = world();
  const player = w.players.get(ranger.yourId)!;
  const weapon = player.weapon;
  assert.equal(weapon.kind, 'ranged');
  const speed = weapon.projectileSpeedTilesPerSec!;
  const travelTicks = Math.ceil((weapon.rangeTiles * TICK_RATE) / speed);

  // Mobs wander, and a straight line between two walkable endpoints can still cross an obstacle
  // (projectiles correctly stop at walls) — retry with a fresh mob/line until one is clear.
  let connected = false;
  for (let attempt = 0; attempt < 5 && !connected; attempt++) {
    const mob = freshMeleeMob(w);
    const spot = cardinalOffsets(w, mob, Math.floor(weapon.rangeTiles)).find((c) =>
      hasLineOfSight({ x: c.x, y: c.y }, { x: mob.state.tileX, y: mob.state.tileY }, w.map),
    );
    if (!spot) continue;
    player.resetAt(spot.x, spot.y, server.content.config.movement);
    const startHp = mob.state.hp;

    ranger.attack(spot.aim);
    await sleep(TICK_MS * 2);
    assert.equal(mob.state.hp, startHp, 'damage has not landed immediately — the projectile is still travelling');

    await sleep(TICK_MS * (travelTicks + 10));
    connected = mob.state.hp < startHp;
  }
  assert.ok(connected, 'the shot connected once its travel time had elapsed');

  await ranger.close();
});

test('a player who dies is frozen, cannot act, and respawns at full health', async () => {
  const alice = await BotClient.join(server.port, 'Alice');
  const w = world();
  const player = w.players.get(alice.yourId)!;
  const maxHp = player.combat.maxHp;
  const mob = freshMeleeMob(w);
  const aggro = mob.def.aggro!;

  const spot = cardinalOffsets(w, mob, 1)[0]!;
  player.resetAt(spot.x, spot.y, server.content.config.movement);
  player.state.hp = 1; // skip the real-time grind of a full fight

  await sleep(TICK_MS * (aggro.attackWindupTicks + 10));
  assert.ok(player.state.hp <= 0, 'the player died');

  const deadTile = { x: player.state.tileX, y: player.state.tileY };
  alice.input('up');
  await sleep(TICK_MS * 4);
  assert.deepEqual([player.state.tileX, player.state.tileY], [deadTile.x, deadTile.y], 'movement input is ignored while dead');

  const respawnTicks = server.content.config.combat.playerRespawnTicks;
  await sleep(TICK_MS * (respawnTicks + 10));
  assert.equal(player.state.hp, maxHp, 'respawned at full health');

  await alice.close();
});

test('PvP: a player can land a melee hit directly on another player', async () => {
  const alice = await BotClient.join(server.port, 'Alice');
  const bob = await BotClient.join(server.port, 'Bob');
  await alice.nextSnapshot((s) => !!s.players.find((p) => p.id === bob.yourId));

  const w = world();
  const aliceP = w.players.get(alice.yourId)!;
  const bobP = w.players.get(bob.yourId)!;

  // Stand Alice directly south of Bob, facing north — well inside melee range.
  aliceP.resetAt(bobP.state.tileX, bobP.state.tileY + 1, server.content.config.movement);
  const startHp = bobP.state.hp;

  alice.attack('up');
  const hitSnap = await alice.nextSnapshot((s) => s.events.some((e) => e.kind === 'hit' && e.sourceId === alice.yourId && e.targetId === bob.yourId));
  const hit = hitSnap.events.find((e) => e.kind === 'hit' && e.targetId === bob.yourId)!;
  assert.ok((hit.damage ?? 0) > 0, 'PvP damage was dealt');
  assert.equal(bobP.state.hp, startHp - (hit.damage ?? 0), "Bob's server-side hp matches the reported PvP damage");

  await alice.close();
  await bob.close();
});
