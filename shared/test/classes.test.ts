import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildRichCharacter,
  deriveBaselineWeapon,
  isRichCharacter,
  mergeRichCharacters,
  parseClassAnimations,
  validateClassMeta,
  validateSkills,
  type CharacterCatalog,
} from '../src/index';

const assetsDir = fileURLToPath(new URL('../../assets', import.meta.url));
const readJson = (path: string): unknown => JSON.parse(readFileSync(`${assetsDir}/${path}`, 'utf8'));

const classMetas = validateClassMeta(readJson('data/classes.json'));
const skills = validateSkills(readJson('data/skills.json'));
const monkMeta = classMetas.find((c) => c.id === 'monk')!;
const monkAnim = readJson('characters/monk/animations/monk.json');

test('parseClassAnimations reads the real monk.json: 8 directions, explicit rects, attach points', () => {
  const parsed = parseClassAnimations(monkAnim, 'monk');
  assert.equal(parsed.frameWidth, 96);
  assert.equal(parsed.frameHeight, 96);
  assert.ok(Math.abs(parsed.anchor.x - 0.5) < 1e-6);
  assert.ok(Math.abs(parsed.anchor.y - 76 / 96) < 1e-6);

  const idle = parsed.clips.idle!;
  assert.equal(idle.frames, 4);
  assert.equal(idle.loop, true);
  assert.equal(idle.durationsMs.length, 4);
  for (const dir of ['down', 'down-left', 'left', 'up-left', 'up', 'up-right', 'right', 'down-right'] as const) {
    assert.equal(idle.rects[dir].length, 4, `idle must have 4 frame rects for ${dir}`);
  }
  assert.ok(idle.attach, 'idle has attach data in the real file');
  assert.ok(idle.attach!.down[0]!.chest, 'idle attach includes a chest point');

  const attack1 = parsed.clips.attack_1!;
  assert.equal(attack1.sheet, 'combat');
  assert.equal(attack1.loop, false);
  assert.ok(parsed.signatureClips.includes('palm_combo'));
});

test('parseClassAnimations rejects malformed input instead of guessing', () => {
  assert.throws(() => parseClassAnimations({}, 'monk'));
  assert.throws(() => parseClassAnimations({ frame: { width: 96, height: 96, anchor: { x: 48, y: 76 } }, animations: {} }, 'monk'));
});

test("deriveBaselineWeapon classifies by the class's real weapon name, not skill range", () => {
  const rangerMeta = classMetas.find((c) => c.id === 'ranger')!;
  const quickShot = skills.find((s) => s.id === 'ranger_quick_shot')!;
  const weapon = deriveBaselineWeapon(rangerMeta, quickShot, 20);
  assert.equal(weapon.kind, 'ranged', 'ranger carries a bow, even though quick_shot.range (1.5) looks melee-sized');

  const spiritPalm = skills.find((s) => s.id === 'monk_spirit_palm')!;
  const monkWeapon = deriveBaselineWeapon(monkMeta, spiritPalm, 20);
  assert.equal(monkWeapon.kind, 'melee');
});

test('buildRichCharacter / mergeRichCharacters produce a usable CharacterDefinition for every class', () => {
  const parsed = parseClassAnimations(monkAnim, 'monk');
  const levelOne = skills.find((s) => s.id === 'monk_spirit_palm')!;
  const monk = buildRichCharacter(monkMeta, parsed, levelOne, 20);
  assert.equal(monk.renderKind, 'rich');
  assert.equal(monk.classId, 'monk');
  assert.ok(monk.combat.maxHp > 0 && monk.combat.attack > 0);
  assert.ok(isRichCharacter(monk));

  const base: CharacterCatalog = { defaultCharacter: 'ashvale', characters: [] };
  const rawByClass = Object.fromEntries(classMetas.map((m) => [m.id, readJson(`characters/${m.id}/animations/${m.id}.json`)]));
  const merged = mergeRichCharacters(base, classMetas, rawByClass, skills, 20);
  assert.equal(merged.characters.length, 18);
  for (const c of merged.characters) {
    assert.ok(isRichCharacter(c), `${c.id} should be rich`);
  }
});

test('every skill references a real clip (or null for passives) and a vfx archetype shaped like "class/archetype"', () => {
  for (const skill of skills) {
    assert.ok(skill.animation.clip === null || typeof skill.animation.clip === 'string');
    const [cls, archetype] = skill.vfx.split('/');
    assert.equal(cls, skill.class, `${skill.id}: vfx class prefix should match the skill's own class`);
    assert.ok(archetype && archetype.length > 0);
  }
});
