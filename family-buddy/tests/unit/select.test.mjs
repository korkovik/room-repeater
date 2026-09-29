// @ts-check
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ageMonths } from '../../dev/js/age.js';
import { inRange, isLinkOnly, rrVisible, selectActivities, selectStage, toActivitiesFile, toStagePlan, toStagesFile, uniqueSources, usesLicence } from '../../dev/js/select.js';
import { dobFixtures, readJson } from './helpers.mjs';

/** @typedef {import('../../dev/js/select.js').Activity} Activity */

const plan = toStagePlan(readJson('dev/content/stage-plan.json'));
const stages = { cs: toStagesFile(readJson('dev/content/cs/stages.json')), en: toStagesFile(readJson('dev/content/en/stages.json')) };
const activities = { cs: toActivitiesFile(readJson('dev/content/cs/activities.json')), en: toActivitiesFile(readJson('dev/content/en/activities.json')) };

/**
 * @param {string} id
 * @param {Partial<Activity>} [over]
 * @returns {Activity}
 */
function fixture(id, over = {}) {
  return {
    id, ageFromMonths: 18, ageToMonths: 24, setting: 'indoor', minutes: 10, title: id, steps: ['a', 'b'], why: 'w',
    sources: [{ title: 't', publisher: 'p', url: `https://example.org/${id}`, accessed: '2026-09-28', licence: 'public-domain' }],
    reviewed: { by: null, date: null }, ...over,
  };
}

describe('selectStage (R12, R21–R23, #37)', () => {
  const expected = [
    [11, 'pre'], [12, 'unwritten', 'm12-15'], [17, 'unwritten', 'm15-18'], [18, 'written', 'm18-24'], [23, 'written', 'm18-24'],
    [24, 'written', 'm24-30'], [29, 'written', 'm24-30'], [30, 'unwritten', 'm30-36'], [47, 'unwritten', 'm42-48'],
    [48, 'written', 'm48-60'], [59, 'written', 'm48-60'], [60, 'post'], [71, 'post'],
  ];
  for (const [months = 0, state, id] of expected) {
    test(`${months} months → ${state} ${id ?? ''}`, () => {
      const result = selectStage(Number(months), plan, stages.en.stages);
      assert.equal(result.state, state);
      if (result.state === 'written') {
        assert.equal(result.stage.id, id);
        assert.equal(result.planStage.id, id);
      }
      if (result.state === 'unwritten') assert.equal(result.planStage?.id, id);
    });
  }
  test('fixture table states agree', () => {
    const { today, rows } = dobFixtures();
    for (const row of rows) {
      const result = selectStage(ageMonths(row.dob, today), plan, stages.cs.stages);
      assert.equal(result.state, row.state, row.key);
      if (result.state === 'written') assert.equal(result.stage.id, row.stage, row.key);
      if (result.state === 'unwritten') assert.equal(result.planStage?.id, row.stage, row.key);
      assert.equal(rrVisible(ageMonths(row.dob, today), activities.cs.activities), row.rr, row.key);
    }
  });
  test('a gap in the plan yields unwritten without a plan stage', () => {
    const gappy = { coverage: { fromMonths: 12, toMonths: 60 }, stages: [{ id: 'm12-15', ageFromMonths: 12, ageToMonths: 15 }] };
    assert.deepEqual(selectStage(20, gappy, []), { state: 'unwritten', planStage: null });
  });
});

describe('selectActivities (R16, #38, #39)', () => {
  const list = [
    fixture('a-room-repeater', { ageToMonths: 48, module: 'room-repeater' }),
    fixture('a1'), fixture('a2'), fixture('a3'), fixture('a4'), fixture('a5'),
    fixture('o1', { setting: 'outdoor', ageFromMonths: 24, ageToMonths: 30 }),
  ];
  test('≤ 3, file order, module excluded', () => {
    assert.deepEqual(selectActivities(20, 'indoor', list).map((a) => a.id), ['a1', 'a2', 'a3']);
  });
  test('half-open ranges', () => {
    assert.deepEqual(selectActivities(24, 'outdoor', list).map((a) => a.id), ['o1']);
    assert.deepEqual(selectActivities(23, 'outdoor', list), []);
  });
  test('no match → empty list', () => {
    assert.deepEqual(selectActivities(70, 'indoor', list), []);
  });
  test('real content: 3 per setting in every written stage, never the module', () => {
    for (const lang of /** @type {const} */ (['cs', 'en'])) {
      for (const months of [18, 20, 23, 24, 29, 48, 59]) {
        for (const setting of /** @type {const} */ (['indoor', 'outdoor'])) {
          const chosen = selectActivities(months, setting, activities[lang].activities);
          assert.equal(chosen.length, 3, `${lang} ${months} ${setting}`);
          assert.ok(chosen.every((a) => a.module === undefined && a.setting === setting));
        }
      }
    }
  });
});

describe('rrVisible (R17, #40)', () => {
  test('real content: 17 no, 18 yes, 47 yes, 48 no', () => {
    assert.equal(rrVisible(17, activities.en.activities), false);
    assert.equal(rrVisible(18, activities.en.activities), true);
    assert.equal(rrVisible(47, activities.en.activities), true);
    assert.equal(rrVisible(48, activities.en.activities), false);
  });
  test('range comes from the content item, not constants', () => {
    const wide = [fixture('a-room-repeater', { ageFromMonths: 12, ageToMonths: 72, module: 'room-repeater' })];
    assert.equal(rrVisible(13, wide), true);
    assert.equal(rrVisible(71, wide), true);
    assert.equal(rrVisible(20, []), false);
  });
});

describe('B1 sample content shape (#41)', () => {
  for (const lang of /** @type {const} */ (['cs', 'en'])) {
    test(`${lang}: written stages, coverage flag, RR item`, () => {
      assert.deepEqual(stages[lang].stages.map((s) => s.id), ['m18-24', 'm24-30', 'm48-60']);
      assert.equal(stages[lang].complete, false);
      const rr = activities[lang].activities.find((a) => a.id === 'a-room-repeater');
      assert.ok(rr);
      assert.equal(rr.ageFromMonths, 18);
      assert.equal(rr.ageToMonths, 48);
      assert.equal(rr.module, 'room-repeater');
      for (const stage of stages[lang].stages) {
        for (const setting of ['indoor', 'outdoor']) {
          const covering = activities[lang].activities.filter((a) => a.module === undefined && a.setting === setting && a.ageFromMonths <= stage.ageFromMonths && a.ageToMonths >= stage.ageToMonths);
          assert.ok(covering.length >= 3, `${lang} ${stage.id} ${setting}`);
        }
      }
    });
  }
});

describe('About helpers (R20)', () => {
  test('uniqueSources dedupes by URL in first-seen order', () => {
    const a = fixture('x');
    const b = fixture('y', { sources: [...fixture('x').sources, ...fixture('z').sources] });
    assert.deepEqual(uniqueSources([], [a, b]).map((s) => s.url), ['https://example.org/x', 'https://example.org/z']);
  });
  test('licence flags on the real content: WHO yes, CC BY no, OGL never', () => {
    assert.equal(usesLicence(stages.en.stages, activities.en.activities, 'CC-BY-NC-SA-3.0-IGO'), true);
    assert.equal(usesLicence(stages.en.stages, activities.en.activities, 'CC-BY-4.0'), false);
    assert.equal(usesLicence(stages.en.stages, activities.en.activities, 'OGL-3.0'), false);
  });
  test('isLinkOnly splits NHS/UNICEF off; Room Repeater item cites only its own site', () => {
    const all = uniqueSources(stages.en.stages, activities.en.activities);
    assert.ok(all.filter(isLinkOnly).every((s) => !/cdc\.gov/.test(s.url)));
    assert.ok(all.filter((s) => !isLinkOnly(s)).every((s) => !/nhs\.uk|unicef\.org/.test(s.url)));
    const rr = activities.en.activities.find((a) => a.id === 'a-room-repeater');
    assert.deepEqual(rr?.sources.map((s) => [s.publisher, s.licence]), [['Room Repeater', 'link-only']]);
  });
  test('inRange is half-open', () => {
    const item = { id: 'x', ageFromMonths: 18, ageToMonths: 24 };
    assert.equal(inRange(17, item), false);
    assert.equal(inRange(18, item), true);
    assert.equal(inRange(24, item), false);
  });
});

describe('content shape guards', () => {
  test('reject malformed files', () => {
    assert.throws(() => toStagePlan({ coverage: {} }));
    assert.throws(() => toStagesFile({ lang: 'en', contentVersion: '1', coverage: { complete: 'no' }, stages: [] }));
    assert.throws(() => toActivitiesFile({ lang: 'en', contentVersion: '1', activities: [{ ...fixture('a'), setting: 'kitchen' }] }));
  });
});
