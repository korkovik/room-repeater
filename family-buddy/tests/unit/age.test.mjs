// @ts-check
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addDays, addMonths, ageDays, ageLabel, ageMonths, ageWeeks, guideStartDate, isValidDate, parseDate, rawAgeMonths, todayLocal } from '../../dev/js/age.js';
import { formatLongDate } from '../../dev/js/i18n.js';
import { dobFixtures } from './helpers.mjs';

describe('AC-26 age outline', () => {
  const rows = [
    { dob: '2025-01-31', today: '2025-02-28', m: 1, en: '4 weeks', cs: '4 týdny' },
    { dob: '2024-02-29', today: '2025-02-28', m: 12, en: '12 months', cs: '12 měsíců' },
    { dob: '2026-10-15', today: '2026-10-15', m: 0, en: 'less than a week', cs: 'méně než týden' },
    { dob: '2026-08-27', today: '2026-10-15', m: 1, en: '7 weeks', cs: '7 týdnů' },
    { dob: '2024-10-15', today: '2026-10-15', m: 24, en: '2 years', cs: '2 roky' },
    { dob: '2024-03-30', today: '2024-04-01', m: 0, en: 'less than a week', cs: 'méně než týden' },
  ];
  for (const row of rows) {
    test(`${row.dob} → ${row.today}: ${row.m} months, "${row.en}"`, () => {
      assert.equal(ageMonths(row.dob, row.today), row.m);
      assert.equal(ageLabel(row.dob, row.today, 'en'), row.en);
      assert.equal(ageLabel(row.dob, row.today, 'cs'), row.cs);
    });
  }
  test('day counts behind the rows', () => {
    assert.equal(ageDays('2026-08-27', '2026-10-15'), 49);
    assert.equal(ageDays('2024-03-30', '2024-04-01'), 2);
  });
});

describe('R9 month arithmetic', () => {
  test('DST autumn weekend (#28)', () => {
    assert.equal(ageDays('2026-10-24', '2026-10-26'), 2);
    assert.equal(ageMonths('2026-10-24', '2026-10-26'), 0);
  });
  test('born on the 31st (#29)', () => {
    assert.equal(ageMonths('2025-01-31', '2025-02-27'), 0);
    assert.equal(ageMonths('2025-01-31', '2025-02-28'), 1);
    assert.equal(ageMonths('2025-01-31', '2025-03-30'), 1);
    assert.equal(ageMonths('2025-01-31', '2025-03-31'), 2);
  });
  test('29 February in a leap year (#30)', () => {
    assert.equal(ageMonths('2024-02-29', '2024-03-28'), 0);
    assert.equal(ageMonths('2024-02-29', '2024-03-29'), 1);
  });
  test('year boundary (#31)', () => {
    assert.equal(ageMonths('2025-12-15', '2026-01-14'), 0);
    assert.equal(ageDays('2025-12-15', '2026-01-14'), 30);
    assert.equal(ageLabel('2025-12-15', '2026-01-14', 'en'), '4 weeks');
  });
  test('future DOB is clamped, raw value is negative', () => {
    assert.equal(rawAgeMonths('2026-11-01', '2026-10-15'), -1);
    assert.equal(ageMonths('2026-11-01', '2026-10-15'), 0);
    assert.equal(ageDays('2026-11-01', '2026-10-15'), 0);
    assert.equal(ageWeeks('2026-11-01', '2026-10-15'), 0);
    assert.equal(ageLabel('2026-11-01', '2026-10-15', 'en'), 'less than a week');
  });
});

describe('R11 label thresholds (#32)', () => {
  const today = '2026-10-15';
  const rows = [
    ['2026-10-08', '1 week', '1 týden'],
    ['2026-10-01', '2 weeks', '2 týdny'],
    ['2026-07-16', '13 weeks', '13 týdnů'],
    ['2026-07-15', '3 months', '3 měsíce'],
    ['2026-05-15', '5 months', '5 měsíců'],
    ['2024-11-15', '23 months', '23 měsíců'],
  ];
  for (const [dob = '', en, cs] of rows) {
    test(`${dob} → ${en} / ${cs}`, () => {
      assert.equal(ageLabel(dob, today, 'en'), en);
      assert.equal(ageLabel(dob, today, 'cs'), cs);
    });
  }
  test('13 weeks is still 2 months', () => {
    assert.equal(ageMonths('2026-07-16', today), 2);
    assert.equal(ageDays('2026-07-16', today), 91);
  });
});

describe('fixture table (§1.5, #33, #34)', () => {
  const { today, rows } = dobFixtures();
  for (const row of rows) {
    test(`${row.key} ${row.dob}`, () => {
      assert.equal(ageMonths(row.dob, today), row.months);
      assert.equal(ageLabel(row.dob, today, 'en'), row.en);
      assert.equal(ageLabel(row.dob, today, 'cs'), row.cs);
      if (row.start) assert.equal(guideStartDate(row.dob), row.start);
    });
  }
});

describe('R21 anniversary and formatting (#35)', () => {
  test('12-month anniversaries', () => {
    assert.equal(guideStartDate('2026-03-01'), '2027-03-01');
    assert.equal(guideStartDate('2025-01-31'), '2026-01-31');
    assert.equal(guideStartDate('2024-02-29'), '2025-02-28');
  });
  test('long dates in both languages', () => {
    assert.equal(formatLongDate('2027-03-01', 'cs'), '1. března 2027');
    assert.equal(formatLongDate('2027-03-01', 'en'), '1 March 2027');
    assert.equal(formatLongDate('2027-10-15', 'en'), '15 October 2027');
  });
});

describe('date helpers', () => {
  test('parseDate accepts only real YYYY-MM-DD dates', () => {
    assert.deepEqual(parseDate('2024-02-29'), { y: 2024, m: 2, d: 29 });
    for (const bad of ['2025-02-29', '2025-13-01', '31.1.2025', '', '2025-1-31', null, 20250131]) {
      assert.equal(parseDate(bad), null, String(bad));
      assert.equal(isValidDate(bad), false);
    }
  });
  test('addMonths clamps to the month end and goes backwards', () => {
    assert.equal(addMonths('2025-01-31', 1), '2025-02-28');
    assert.equal(addMonths('2026-10-15', -72), '2020-10-15');
    assert.equal(addMonths('2026-02-28', -72), '2020-02-28');
    assert.equal(addMonths('2024-03-31', -1), '2024-02-29');
  });
  test('addDays crosses months, years and leap days', () => {
    assert.equal(addDays('2020-10-15', 1), '2020-10-16');
    assert.equal(addDays('2024-02-28', 1), '2024-02-29');
    assert.equal(addDays('2025-12-31', 1), '2026-01-01');
    assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  });
  test('todayLocal reads local calendar fields', () => {
    assert.equal(todayLocal(new Date(2026, 9, 15, 0, 1)), '2026-10-15');
    assert.equal(todayLocal(new Date(2026, 9, 14, 23, 59)), '2026-10-14');
  });
});
