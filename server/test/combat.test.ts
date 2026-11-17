/**
 * Server-authoritative combat acceptance tests: real WebSocket clients against
 * a real server instance, same pattern as multiplayer.test.ts (BotClient).
 * Mobs are picked fresh per test (never reused) so one test's effect on a mob
 * (damage, aggro, death) can never leak into another test's assertions.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { DEFAULT_AGGRO, hasLineOfSight, tickMs, type Direction, type MobSpawn, type Walkability } from '@thistlevane/shared';
import { startGameServer, type RunningGameServer } from '../src/GameServer';
import { Mob, type MobTickContext } from '../src/world/Mob';
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

test('a killed mob stops blocking its tile immediately, hides from snapshots once its corpse window elapses, and respawns at full health inside its home region', async () => {
  const alice = await BotClient.join(server.port, 'Alice');
  const w = world();
  const mob = freshMeleeMob(w);
  const player = w.players.get(alice.yourId)!;
  const aggro = mob.def.aggro!;
  const corpseTicks = aggro.corpseTicks ?? DEFAULT_AGGRO.corpseTicks!;
  const maxHp = mob.def.combat!.maxHp;
  const mobTile = { x: mob.state.tileX, y: mob.state.tileY };

  const spot = cardinalOffsets(w, mob, 1)[0]!;
  player.resetAt(spot.x, spot.y, server.content.config.movement);
  mob.state.hp = 0;

  // Collision: the corpse must not block the tile it died on.
  alice.input(spot.aim);
  await sleep(TICK_MS * 6);
  assert.deepEqual([player.state.tileX, player.state.tileY], [mobTile.x, mobTile.y], "walked straight onto the corpse's tile, unblocked");

  // Briefly still visible (dead) right after death.
  const deadSnap = await alice.nextSnapshot((s) => s.mobs.some((m) => m.id === mob.id));
  assert.ok(deadSnap.mobs.find((m) => m.id === mob.id)!.hp <= 0, 'the corpse is visible, at 0 hp, just after death');

  // Hidden once the corpse window elapses — well before the full respawn timer.
  await sleep(TICK_MS * (corpseTicks + 10));
  const hiddenSnap = await alice.nextSnapshot();
  assert.ok(!hiddenSnap.mobs.some((m) => m.id === mob.id), 'the corpse is gone from snapshots once its corpse window elapses');

  // Respawns at full health, inside its home region.
  await sleep(TICK_MS * (aggro.respawnTicks - corpseTicks + 10));
  assert.equal(mob.state.hp, maxHp, 'respawned at full health');
  const inHome =
    mob.state.tileX >= mob.home.x && mob.state.tileX < mob.home.x + mob.home.w &&
    mob.state.tileY >= mob.home.y && mob.state.tileY < mob.home.y + mob.home.h;
  assert.ok(inHome, 'respawned inside its home region');

  await alice.close();
});

test('a mob_spawn region can override respawnTicks/corpseTicks for just that spawn group', () => {
  const def = server.content.mobs.mobs['slime']!;
  // slime's own aggro.respawnTicks is ~100 in mobs.json and has no corpseTicks at all — small,
  // distinct override values here prove the per-spawn fields are what's actually being read.
  const home: MobSpawn = { x: 0, y: 0, w: 3, h: 3, mob: 'slime', count: 1, respawnTicks: 5, corpseTicks: 2 };
  const alwaysWalkable: Walkability = { isWalkable: () => true };
  const ctx: MobTickContext = { world: alwaysWalkable, map: alwaysWalkable, players: new Map(), emit: () => {}, spawnProjectile: () => {} };
  const mob = new Mob('test-mob', 'slime', def, home, 1, 1, () => 0.5);

  mob.state.hp = 0;
  mob.tick(ctx);
  assert.ok(mob.isVisible, 'visible for the first tick of the overridden corpseTicks window');
  mob.tick(ctx);
  assert.ok(!mob.isVisible, 'hidden once the overridden corpseTicks window elapses, not the (much larger) mob-definition default');
  mob.tick(ctx);
  mob.tick(ctx);
  assert.ok(mob.state.hp <= 0, 'not yet respawned');
  mob.tick(ctx);
  assert.equal(mob.state.hp, def.combat!.maxHp, 'respawned after the overridden respawnTicks, not the mob-definition default');
  assert.ok(mob.isVisible, 'visible again once respawned');
});

test('a melee attack with a targetId lands even when the claimed aim points the wrong way', async () => {
  const alice = await BotClient.join(server.port, 'Alice');
  const w = world();
  const mob = freshMeleeMob(w);
  const player = w.players.get(alice.yourId)!;
  const spot = cardinalOffsets(w, mob, 1)[0]!;
  const wrongAim: Direction = (['up', 'down', 'left', 'right'] as const).find((d) => d !== spot.aim)!;
  player.resetAt(spot.x, spot.y, server.content.config.movement);
  const startHp = mob.state.hp;

  alice.attack(wrongAim, mob.id);
  const hitSnap = await alice.nextSnapshot((s) => s.events.some((e) => e.kind === 'hit' && e.sourceId === alice.yourId && e.targetId === mob.id));
  const hit = hitSnap.events.find((e) => e.kind === 'hit' && e.targetId === mob.id)!;
  assert.ok((hit.damage ?? 0) > 0, 'damage landed despite the claimed aim pointing away from the mob');
  assert.equal(mob.state.hp, startHp - (hit.damage ?? 0), "server's own mob hp matches the reported damage");
  const attackEvent = hitSnap.events.find((e) => e.kind === 'attack' && e.sourceId === alice.yourId)!;
  assert.equal(attackEvent.aim, spot.aim, "the broadcast attack aim was recomputed toward the mob's real position, not the claimed one");

  await alice.close();
});

test('a melee attack with a wrong aim and no targetId still misses (the untargeted path is deliberately unchanged)', async () => {
  const alice = await BotClient.join(server.port, 'Alice');
  const w = world();
  const mob = freshMeleeMob(w);
  const player = w.players.get(alice.yourId)!;
  const spot = cardinalOffsets(w, mob, 1)[0]!;
  const wrongAim: Direction = (['up', 'down', 'left', 'right'] as const).find((d) => d !== spot.aim)!;
  player.resetAt(spot.x, spot.y, server.content.config.movement);
  const startHp = mob.state.hp;

  alice.attack(wrongAim); // no targetId
  await sleep(TICK_MS * 4);
  assert.equal(mob.state.hp, startHp, 'no damage: the claimed aim misses and there is no target to recompute from');

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

test('PvP: a targetId recomputes aim toward another player too, not just mobs', async () => {
  const alice = await BotClient.join(server.port, 'Alice');
  const bob = await BotClient.join(server.port, 'Bob');
  await alice.nextSnapshot((s) => !!s.players.find((p) => p.id === bob.yourId));

  const w = world();
  const aliceP = w.players.get(alice.yourId)!;
  const bobP = w.players.get(bob.yourId)!;

  // Alice stands south of Bob (the real direction back to Bob is 'up'), but claims 'down'.
  aliceP.resetAt(bobP.state.tileX, bobP.state.tileY + 1, server.content.config.movement);
  const startHp = bobP.state.hp;

  alice.attack('down', bob.yourId);
  const hitSnap = await alice.nextSnapshot((s) => s.events.some((e) => e.kind === 'hit' && e.sourceId === alice.yourId && e.targetId === bob.yourId));
  const hit = hitSnap.events.find((e) => e.kind === 'hit' && e.targetId === bob.yourId)!;
  assert.ok((hit.damage ?? 0) > 0, 'PvP damage landed despite the claimed aim pointing away from Bob');
  assert.equal(bobP.state.hp, startHp - (hit.damage ?? 0), "Bob's server-side hp matches the reported PvP damage");

  await alice.close();
  await bob.close();
});
