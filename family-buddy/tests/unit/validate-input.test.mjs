// @ts-check
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { dobBounds, validateChildInput, validateDob, validateName } from '../../dev/js/validate.js';
import { dobFixtures } from './helpers.mjs';

const today = '2026-10-15';

describe('validateDob (R6, BA5, #36)', () => {
  test('boundaries', () => {
    assert.deepEqual(validateDob('2020-10-15', today), { ok: false, error: 'dobTooOld' });
    assert.deepEqual(validateDob('2020-10-16', today), { ok: true });
    assert.deepEqual(validateDob('2026-10-16', today), { ok: false, error: 'dobFuture' });
    assert.deepEqual(validateDob('2026-10-15', today), { ok: true });
    assert.deepEqual(validateDob('', today), { ok: false, error: 'dobEmpty' });
    assert.deepEqual(validateDob('2025-02-30', today), { ok: false, error: 'dobEmpty' });
  });
  test('fixture rejections', () => {
    for (const row of dobFixtures().rejected) assert.deepEqual(validateDob(row.dob, today), { ok: false, error: row.error }, row.key);
  });
});

describe('validateName (R5, D1)', () => {
  test('trims and counts code points', () => {
    assert.deepEqual(validateName(' Ema '), { ok: true, name: 'Ema' });
    assert.deepEqual(validateName('   '), { ok: false, error: 'nameEmpty' });
    assert.deepEqual(validateName('W'.repeat(40)), { ok: true, name: 'W'.repeat(40) });
    assert.deepEqual(validateName('W'.repeat(41)), { ok: false, error: 'nameTooLong' });
    assert.deepEqual(validateName('🦊'.repeat(40)), { ok: true, name: '🦊'.repeat(40) });
  });
});

describe('validateChildInput', () => {
  test('reports both errors at once', () => {
    assert.deepEqual(validateChildInput({ name: '', dob: '' }, today), { ok: false, errors: { name: 'nameEmpty', dob: 'dobEmpty' } });
    assert.deepEqual(validateChildInput({ name: ' Ema ', dob: '2025-01-31' }, today), { ok: true, name: 'Ema', dob: '2025-01-31' });
  });
});

describe('dobBounds (R5, #16)', () => {
  test('today 2026-10-15', () => {
    assert.deepEqual(dobBounds(today), { min: '2020-10-16', max: '2026-10-15' });
  });
});
