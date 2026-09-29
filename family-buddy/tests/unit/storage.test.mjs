// @ts-check
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { activeChild, createProfile, forgetActiveChild, loadProfile, newChildId, parseStored, removeProfile, saveProfile, toProfile, updateActiveChild } from '../../dev/js/storage.js';

/** @typedef {import('../../dev/js/storage.js').StorageLike} StorageLike */

/** In-memory Storage stub that records writes. */
function memoryStore() {
  /** @type {Map<string, string>} */
  const data = new Map();
  /** @type {string[]} */
  const writes = [];
  /** @type {StorageLike} */
  const store = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      writes.push(`set:${k}`);
      data.set(k, v);
    },
    removeItem: (k) => {
      writes.push(`remove:${k}`);
      data.delete(k);
    },
  };
  return { data, writes, get: () => store };
}

const valid = createProfile({ name: 'Ema', dob: '2025-01-31', lang: 'cs', today: '2026-10-15', id: 'c-9f2a41d0' });

describe('profile schema', () => {
  test('createProfile matches the spec example', () => {
    assert.deepEqual(valid, {
      schemaVersion: 1, lang: 'cs', activeChildId: 'c-9f2a41d0',
      children: [{ id: 'c-9f2a41d0', name: 'Ema', dob: '2025-01-31', createdAt: '2026-10-15' }], done: [],
    });
  });
  test('newChildId is c- plus 8 hex characters', () => {
    for (let i = 0; i < 20; i += 1) assert.match(newChildId(), /^c-[0-9a-f]{8}$/);
    assert.equal(newChildId({ getRandomValues: (array) => { if (array instanceof Uint8Array) array.fill(255); return array; } }), 'c-ffffffff');
  });
  test('toProfile rejects missing or malformed fields (R28, #71)', () => {
    assert.ok(toProfile(valid));
    const bad = [
      { schemaVersion: 1 },
      { ...valid, lang: 'de' },
      { ...valid, children: [] },
      { ...valid, children: [{ id: 'c-9f2a41d0', name: 'Ema', createdAt: '2026-10-01' }] },
      { ...valid, children: [{ ...valid.children[0], dob: '31.1.2025' }] },
      { ...valid, children: [{ ...valid.children[0], id: 'x' }] },
      { ...valid, children: [{ ...valid.children[0], name: 'W'.repeat(41) }] },
      { ...valid, children: [{ ...valid.children[0], name: '   ' }] },
      { ...valid, activeChildId: 'c-00000000' },
      { ...valid, done: 'no' },
      null, [], 'text',
    ];
    for (const value of bad) assert.equal(toProfile(value), null, JSON.stringify(value));
  });
});

describe('parseStored / loadProfile (R27–R29)', () => {
  test('empty, corrupt, newer and valid values', () => {
    assert.deepEqual(parseStored(null), { kind: 'empty' });
    assert.deepEqual(parseStored('{not json'), { kind: 'invalid' });
    assert.deepEqual(parseStored('{"schemaVersion":1}'), { kind: 'invalid' });
    assert.deepEqual(parseStored('{"schemaVersion":2,"lang":"en","children":[],"done":[]}'), { kind: 'newer', version: 2 });
    assert.deepEqual(parseStored(JSON.stringify(valid)), { kind: 'ok', profile: valid });
  });
  test('loading never writes, even for corrupt or newer data', () => {
    const mem = memoryStore();
    mem.data.set('fb-v1-dev', '{not json');
    assert.equal(loadProfile('fb-v1-dev', mem.get).kind, 'invalid');
    mem.data.set('fb-v1-dev', '{"schemaVersion":2}');
    assert.equal(loadProfile('fb-v1-dev', mem.get).kind, 'newer');
    assert.deepEqual(mem.writes, []);
  });
  test('storage that throws on access or on getItem is "unavailable"', () => {
    assert.deepEqual(loadProfile('k', () => { throw new Error('SecurityError'); }), { kind: 'unavailable' });
    const throwing = { getItem: () => { throw new Error('x'); }, setItem: () => {}, removeItem: () => {} };
    assert.deepEqual(loadProfile('k', () => throwing), { kind: 'unavailable' });
  });
  test('save and remove report failure instead of throwing', () => {
    const quota = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => { throw new Error('x'); } };
    assert.equal(saveProfile('k', valid, () => quota), false);
    assert.equal(removeProfile('k', () => quota), false);
    const mem = memoryStore();
    assert.equal(saveProfile('fb-v1-dev', valid, mem.get), true);
    assert.equal(mem.data.get('fb-v1-dev'), JSON.stringify(valid));
    assert.equal(removeProfile('fb-v1-dev', mem.get), true);
    assert.equal(mem.data.has('fb-v1-dev'), false);
  });
});

describe('child edits', () => {
  test('update keeps the id', () => {
    const next = updateActiveChild(valid, { name: 'Emička', dob: '2024-10-15' });
    assert.deepEqual(activeChild(next), { id: 'c-9f2a41d0', name: 'Emička', dob: '2024-10-15', createdAt: '2026-10-15' });
  });
  test('forgetting the only child returns null', () => {
    assert.equal(forgetActiveChild(valid), null);
  });
  test('forgetting one of two children keeps the other and its done entries', () => {
    const two = {
      ...valid,
      children: [...valid.children, { id: 'c-0000000b', name: 'Tom', dob: '2023-01-01', createdAt: '2026-10-15' }],
      done: [{ childId: 'c-9f2a41d0', activityId: 'a-x', date: '2026-10-15' }, { childId: 'c-0000000b', activityId: 'a-y', date: '2026-10-15' }],
    };
    const next = forgetActiveChild(two);
    assert.ok(next);
    assert.equal(next.activeChildId, 'c-0000000b');
    assert.deepEqual(next.done.map((d) => d.childId), ['c-0000000b']);
  });
});
