// @ts-check
/**
 * On-device profile storage (spec Data "Storage", R27–R29).
 * Every function takes a Storage-like object (or a getter for one) so unit tests can pass
 * a stub; access to localStorage itself may throw (blocked storage), which is handled here.
 */
import { isValidDate } from './age.js';
import { validateName } from './validate.js';

export const SCHEMA_VERSION = 1;

/** @typedef {'cs' | 'en'} Lang */
/** @typedef {{ id: string, name: string, dob: string, createdAt: string }} Child */
/** @typedef {{ childId: string, activityId: string, date: string }} DoneEntry */
/**
 * @typedef {{
 *   schemaVersion: 1,
 *   lang: Lang,
 *   activeChildId: string,
 *   children: Child[],
 *   done: DoneEntry[]
 * }} Profile
 */
/** @typedef {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>} StorageLike */
/** @typedef {() => StorageLike} StorageGetter */
/**
 * @typedef {{ kind: 'empty' }
 *   | { kind: 'invalid' }
 *   | { kind: 'unavailable' }
 *   | { kind: 'newer', version: number }
 *   | { kind: 'ok', profile: Profile }} LoadResult
 */

const CHILD_ID = /^c-[0-9a-f]{8}$/;

/** @type {StorageGetter} */
export const browserStorage = () => globalThis.localStorage;

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is Lang}
 */
export function isLang(value) {
  return value === 'cs' || value === 'en';
}

/**
 * @param {unknown} value
 * @returns {Child | null}
 */
function toChild(value) {
  if (!isRecord(value)) return null;
  const { id, name, dob, createdAt } = value;
  if (typeof id !== 'string' || !CHILD_ID.test(id)) return null;
  // Same rules as the form (1–40 code points after trimming), so foreign or edited data is rejected.
  if (typeof name !== 'string' || !validateName(name).ok) return null;
  if (!isValidDate(dob) || !isValidDate(createdAt)) return null;
  return { id, name, dob, createdAt };
}

/**
 * @param {unknown} value
 * @returns {DoneEntry | null}
 */
function toDone(value) {
  if (!isRecord(value)) return null;
  const { childId, activityId, date } = value;
  if (typeof childId !== 'string' || typeof activityId !== 'string' || !isValidDate(date)) return null;
  return { childId, activityId, date };
}

/**
 * Schema-1 check. Anything that doesn't pass is treated as "no profile" (R28).
 * @param {unknown} value
 * @returns {Profile | null}
 */
export function toProfile(value) {
  if (!isRecord(value) || value.schemaVersion !== SCHEMA_VERSION) return null;
  const { lang, activeChildId, children, done } = value;
  if (!isLang(lang) || typeof activeChildId !== 'string') return null;
  if (!Array.isArray(children) || children.length === 0 || !Array.isArray(done)) return null;
  /** @type {Child[]} */
  const kids = [];
  for (const raw of children) {
    const child = toChild(raw);
    if (!child) return null;
    kids.push(child);
  }
  if (!kids.some((c) => c.id === activeChildId)) return null;
  /** @type {DoneEntry[]} */
  const doneEntries = [];
  for (const raw of done) {
    const entry = toDone(raw);
    if (!entry) return null;
    doneEntries.push(entry);
  }
  return { schemaVersion: SCHEMA_VERSION, lang, activeChildId, children: kids, done: doneEntries };
}

/**
 * Pure: raw stored string → load result.
 * @param {string | null} raw
 * @returns {LoadResult}
 */
export function parseStored(raw) {
  if (raw === null) return { kind: 'empty' };
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'invalid' };
  }
  if (isRecord(parsed) && typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > SCHEMA_VERSION) {
    return { kind: 'newer', version: parsed.schemaVersion };
  }
  const profile = toProfile(parsed);
  return profile ? { kind: 'ok', profile } : { kind: 'invalid' };
}

/**
 * Reads the profile. Never writes, so a corrupt or newer value stays byte-identical (R28, R29).
 * @param {string} key
 * @param {StorageGetter} [getStorage]
 * @returns {LoadResult}
 */
export function loadProfile(key, getStorage = browserStorage) {
  /** @type {string | null} */
  let raw;
  try {
    raw = getStorage().getItem(key);
  } catch {
    return { kind: 'unavailable' };
  }
  return parseStored(raw);
}

/**
 * @param {string} key
 * @param {Profile} profile
 * @param {StorageGetter} [getStorage]
 * @returns {boolean} false when the browser refused (blocked, quota); the caller keeps the
 *   profile in memory for the session and shows the R27 notice.
 */
export function saveProfile(key, profile, getStorage = browserStorage) {
  try {
    getStorage().setItem(key, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} key
 * @param {StorageGetter} [getStorage]
 * @returns {boolean}
 */
export function removeProfile(key, getStorage = browserStorage) {
  try {
    getStorage().removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * "c-" + 8 hex characters from crypto.getRandomValues.
 * @param {Pick<Crypto, 'getRandomValues'>} [random]
 * @returns {string}
 */
export function newChildId(random = globalThis.crypto) {
  const bytes = random.getRandomValues(new Uint8Array(4));
  return `c-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * @param {{ name: string, dob: string, lang: Lang, today: string, id: string }} input
 * @returns {Profile}
 */
export function createProfile({ name, dob, lang, today, id }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    lang,
    activeChildId: id,
    children: [{ id, name, dob, createdAt: today }],
    done: [],
  };
}

/**
 * @param {Profile} profile
 * @returns {Child}
 */
export function activeChild(profile) {
  const child = profile.children.find((c) => c.id === profile.activeChildId) ?? profile.children[0];
  if (!child) throw new Error('Profile without children');
  return child;
}

/**
 * @param {Profile} profile
 * @param {{ name: string, dob: string }} patch
 * @returns {Profile}
 */
export function updateActiveChild(profile, patch) {
  return {
    ...profile,
    children: profile.children.map((c) => (c.id === profile.activeChildId ? { ...c, ...patch } : c)),
  };
}

/**
 * Removes the active child. Returns null when no child remains (the caller then removes the key).
 * @param {Profile} profile
 * @returns {Profile | null}
 */
export function forgetActiveChild(profile) {
  const children = profile.children.filter((c) => c.id !== profile.activeChildId);
  const next = children[0];
  if (!next) return null;
  return {
    ...profile,
    activeChildId: next.id,
    children,
    done: profile.done.filter((d) => d.childId !== profile.activeChildId),
  };
}
