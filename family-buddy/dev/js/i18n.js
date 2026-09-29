// @ts-check
/**
 * UI strings (spec R1, R2). Dictionaries are flat {"key": "text"} JSON files, one per language.
 */

/** @typedef {'cs' | 'en'} Lang */
/** @typedef {Readonly<Record<string, string>>} Dict */

/**
 * R1: cs when the browser language starts with "cs", otherwise en.
 * @param {string | undefined} navigatorLanguage
 * @returns {Lang}
 */
export function detectLang(navigatorLanguage) {
  return (navigatorLanguage ?? '').toLowerCase().startsWith('cs') ? 'cs' : 'en';
}

/**
 * @param {unknown} json
 * @returns {Dict}
 */
export function toDict(json) {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) throw new TypeError('i18n: expected an object');
  /** @type {Record<string, string>} */
  const dict = {};
  for (const [key, value] of Object.entries(json)) {
    if (typeof value !== 'string') throw new TypeError(`i18n: ${key} is not a string`);
    dict[key] = value;
  }
  return dict;
}

/**
 * Replaces {name}-style variables that are given in `vars`. Anything else, including the
 * legal {{PLACEHOLDERS}}, is left untouched.
 * @param {string} template
 * @param {Readonly<Record<string, string | number>>} [vars]
 * @returns {string}
 */
export function format(template, vars = {}) {
  return template.replace(/(?<!\{)\{(\w+)\}(?!\})/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole,
  );
}

/**
 * Looks up a key; a missing key throws, so a gap shows up in the e2e run instead of as blank UI.
 * @param {Dict} dict
 * @param {string} key
 * @param {Readonly<Record<string, string | number>>} [vars]
 * @returns {string}
 */
export function t(dict, key, vars) {
  const value = dict[key];
  if (value === undefined) throw new Error(`Missing i18n key: ${key}`);
  return format(value, vars);
}

/** @type {Readonly<Record<Lang, string>>} */
const DATE_LOCALES = { cs: 'cs-CZ', en: 'en-GB' };

/**
 * Long date for R21 ("1. března 2027" / "1 March 2027"), independent of the device time zone.
 * @param {string} isoDate YYYY-MM-DD
 * @param {Lang} lang
 * @returns {string}
 */
export function formatLongDate(isoDate, lang) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  return new Intl.DateTimeFormat(DATE_LOCALES[lang], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}
