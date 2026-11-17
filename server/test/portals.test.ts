/**
 * Unit tests for portal validation (shared/src/map.ts's parsing + loadContent.ts's
 * validatePortals) — synthetic, minimal maps, no running server needed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MapModel, type MapLayerNames, type TiledMapJson, type TiledObject } from '@thistlevane/shared';
import { validatePortals } from '../src/content/loadContent';
import type { LoadedZone } from '../src/content/loadContent';

const layerNames: MapLayerNames = {
  collision: 'collision', spawns: 'spawns', spawnType: 'player_spawn', mobSpawnType: 'mob_spawn',
  portals: 'portals', portalType: 'portal', aboveCharactersProperty: 'above',
};

function portalObject(name: string, targetZone: string, targetSpawn: string, extra: Record<string, unknown> = {}): TiledObject {
  return {
    type: 'portal', name, x: 16, y: 16, width: 16, height: 16,
    properties: [
      { name: 'targetZone', value: targetZone },
      { name: 'targetSpawn', value: targetSpawn },
      ...Object.entries(extra).map(([n, value]) => ({ name: n, value })),
    ],
  };
}

function buildZone(id: string, portals: TiledObject[]): LoadedZone {
  const json: TiledMapJson = {
    width: 10, height: 10, tilewidth: 16, tileheight: 16, tilesets: [],
    layers: [
      { type: 'objectgroup', name: 'spawns', objects: [{ type: 'player_spawn', name: 'center', x: 80, y: 80 }] },
      { type: 'objectgroup', name: 'portals', objects: portals },
    ],
  };
  return { id, name: id, map: new MapModel(json, layerNames) };
}

test('a portal with no explicit id defaults to its name, and no requirements still validates fine', () => {
  const a = buildZone('a', [portalObject('to_b', 'b', 'center')]);
  const b = buildZone('b', []);
  const maps = new Map([['a', a], ['b', b]]);
  assert.doesNotThrow(() => validatePortals(maps));
  assert.equal(a.map.portals[0]!.id, 'to_b');
});

test('an explicit id property overrides the name-based default', () => {
  const a = buildZone('a', [portalObject('to_b', 'b', 'center', { id: 'east-gate' })]);
  const b = buildZone('b', []);
  assert.equal(a.map.portals[0]!.id, 'east-gate');
  assert.doesNotThrow(() => validatePortals(new Map([['a', a], ['b', b]])));
});

test('duplicate portal ids within the same zone are rejected', () => {
  const a = buildZone('a', [
    portalObject('north', 'b', 'center', { id: 'shared' }),
    portalObject('south', 'b', 'center', { id: 'shared' }),
  ]);
  const b = buildZone('b', []);
  assert.throws(() => validatePortals(new Map([['a', a], ['b', b]])), /duplicate portal id "shared"/);
});

test('the same id reused across two different zones is fine (ids are scoped per zone)', () => {
  const a = buildZone('a', [portalObject('gate', 'b', 'center', { id: 'gate' })]);
  const b = buildZone('b', [portalObject('gate', 'a', 'center', { id: 'gate' })]);
  assert.doesNotThrow(() => validatePortals(new Map([['a', a], ['b', b]])));
});

test('a portal targeting an unknown zone is rejected', () => {
  const a = buildZone('a', [portalObject('nowhere', 'ghost_zone', 'center')]);
  assert.throws(() => validatePortals(new Map([['a', a]])), /unknown zone "ghost_zone"/);
});

test('a portal targeting a missing spawn in a real zone is rejected', () => {
  const a = buildZone('a', [portalObject('to_b', 'b', 'nonexistent_spawn')]);
  const b = buildZone('b', []);
  assert.throws(() => validatePortals(new Map([['a', a], ['b', b]])), /missing spawn "nonexistent_spawn"/);
});

test('requiredLevel and requirements are parsed when present, and absent (not a load error) when malformed', () => {
  const a = buildZone('a', [
    portalObject('gated', 'b', 'center', { requiredLevel: 10, requirements: JSON.stringify(['dragon_slain', 'has_key']) }),
    portalObject('garbled', 'b', 'center', { requiredLevel: 'not-a-number', requirements: 'not json at all' }),
  ]);
  const b = buildZone('b', []);
  assert.doesNotThrow(() => validatePortals(new Map([['a', a], ['b', b]])), 'malformed advisory fields do not fail map loading');

  const [gated, garbled] = a.map.portals;
  assert.equal(gated!.requiredLevel, 10);
  assert.deepEqual(gated!.requirements, ['dragon_slain', 'has_key']);
  assert.equal(garbled!.requiredLevel, undefined, 'a non-numeric requiredLevel is treated as not set');
  assert.equal(garbled!.requirements, undefined, 'an unparseable requirements string is treated as not set');
});
