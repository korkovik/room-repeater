// @ts-check
/**
 * Age rules (spec R8–R11). Pure functions over local calendar dates written as
 * "YYYY-MM-DD" strings. No timestamps and no millisecond arithmetic, so time zones
 * and DST never change a result. "today" is always passed in by the caller.
 */

/** @typedef {'cs' | 'en'} Lang */
/** @typedef {{ readonly y: number, readonly m: number, readonly d: number }} CivilDate */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * @param {number} y
 * @param {number} m 1–12
 * @returns {number}
 */
export function daysInMonth(y, m) {
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 0;
}

/**
 * Parses a real calendar date. Returns null for anything else ("2025-02-30", "31.1.2025", "").
 * @param {unknown} s
 * @returns {CivilDate | null}
 */
export function parseDate(s) {
  if (typeof s !== 'string') return null;
  const match = ISO_DATE.exec(s);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

/**
 * @param {unknown} s
 * @returns {s is string}
 */
export function isValidDate(s) {
  return parseDate(s) !== null;
}

/**
 * @param {string} s
 * @returns {CivilDate}
 */
function mustParse(s) {
  const parsed = parseDate(s);
  if (!parsed) throw new RangeError(`Not a YYYY-MM-DD date: ${s}`);
  return parsed;
}

/**
 * @param {CivilDate} c
 * @returns {string}
 */
export function formatDate(c) {
  return `${String(c.y).padStart(4, '0')}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`;
}

/**
 * Days since 1970-01-01 of a proleptic Gregorian date (H. Hinnant's days_from_civil).
 * @param {CivilDate} c
 * @returns {number}
 */
function daysFromCivil({ y, m, d }) {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/**
 * Inverse of daysFromCivil.
 * @param {number} z
 * @returns {CivilDate}
 */
function civilFromDays(z) {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

/**
 * The device's local calendar date. Called on every render (R13), never cached.
 * @param {Date} [now]
 * @returns {string}
 */
export function todayLocal(now = new Date()) {
  return formatDate({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
}

/**
 * -1, 0 or 1. ISO strings compare correctly as text once they are valid dates.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareDates(a, b) {
  const da = daysFromCivil(mustParse(a));
  const db = daysFromCivil(mustParse(b));
  return da < db ? -1 : da > db ? 1 : 0;
}

/**
 * Adds calendar months; a day that doesn't exist in the target month becomes its last day
 * (2025-01-31 + 1 → 2025-02-28; 2024-02-29 + 12 → 2025-02-28). n may be negative.
 * @param {string} date
 * @param {number} n
 * @returns {string}
 */
export function addMonths(date, n) {
  const { y, m, d } = mustParse(date);
  const index = y * 12 + (m - 1) + n;
  const ty = Math.floor(index / 12);
  const tm = index - ty * 12 + 1;
  return formatDate({ y: ty, m: tm, d: Math.min(d, daysInMonth(ty, tm)) });
}

/**
 * @param {string} date
 * @param {number} n
 * @returns {string}
 */
export function addDays(date, n) {
  return formatDate(civilFromDays(daysFromCivil(mustParse(date)) + n));
}

/**
 * Whole calendar months (R9). A DOB in the future (wrong phone clock) is clamped to 0.
 * @param {string} dob
 * @param {string} today
 * @returns {number}
 */
export function ageMonths(dob, today) {
  return Math.max(0, rawAgeMonths(dob, today));
}

/**
 * R9 without clamping; negative when dob is after today.
 * @param {string} dob
 * @param {string} today
 * @returns {number}
 */
export function rawAgeMonths(dob, today) {
  const b = mustParse(dob);
  const t = mustParse(today);
  const anniversaryDay = Math.min(b.d, daysInMonth(t.y, t.m));
  return (t.y - b.y) * 12 + (t.m - b.m) - (t.d < anniversaryDay ? 1 : 0);
}

/**
 * Calendar days since DOB (R10), clamped to 0.
 * @param {string} dob
 * @param {string} today
 * @returns {number}
 */
export function ageDays(dob, today) {
  return Math.max(0, daysFromCivil(mustParse(today)) - daysFromCivil(mustParse(dob)));
}

/**
 * @param {string} dob
 * @param {string} today
 * @returns {number}
 */
export function ageWeeks(dob, today) {
  return Math.floor(ageDays(dob, today) / 7);
}

/**
 * Grammar table for the age label. It lives here rather than in i18n/*.json because the
 * forms are tied to Intl.PluralRules categories, not to translatable sentences.
 * @type {Readonly<Record<Lang, { lessThanWeek: string, week: Readonly<Record<string, string>>, month: Readonly<Record<string, string>>, year: Readonly<Record<string, string>>, join: string }>>}
 */
const AGE_WORDS = {
  cs: {
    lessThanWeek: 'méně než týden',
    week: { one: 'týden', few: 'týdny', other: 'týdnů' },
    month: { one: 'měsíc', few: 'měsíce', other: 'měsíců' },
    year: { one: 'rok', few: 'roky', other: 'let' },
    join: ' a ',
  },
  en: {
    lessThanWeek: 'less than a week',
    week: { one: 'week', other: 'weeks' },
    month: { one: 'month', other: 'months' },
    year: { one: 'year', other: 'years' },
    join: ' ',
  },
};

/** @type {Readonly<Record<Lang, Intl.PluralRules>>} */
const PLURALS = { cs: new Intl.PluralRules('cs'), en: new Intl.PluralRules('en') };

/**
 * @param {number} n
 * @param {Readonly<Record<string, string>>} forms
 * @param {Lang} lang
 * @returns {string}
 */
function unit(n, forms, lang) {
  const category = PLURALS[lang].select(n);
  return `${n} ${forms[category] ?? forms.other}`;
}

/**
 * Age label (R11): "less than a week" · "N weeks" (< 3 months) · "N months" (3–23) ·
 * "N years" / "N years M months" (≥ 24). CS uses Intl.PluralRules('cs').
 * @param {string} dob
 * @param {string} today
 * @param {Lang} lang
 * @returns {string}
 */
export function ageLabel(dob, today, lang) {
  const words = AGE_WORDS[lang];
  const months = ageMonths(dob, today);
  const weeks = ageWeeks(dob, today);
  if (weeks === 0) return words.lessThanWeek;
  if (months < 3) return unit(weeks, words.week, lang);
  if (months < 24) return unit(months, words.month, lang);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearsText = unit(years, words.year, lang);
  return rest === 0 ? yearsText : `${yearsText}${words.join}${unit(rest, words.month, lang)}`;
}

/**
 * The 12-month anniversary used by the pre-range message (R21).
 * @param {string} dob
 * @returns {string}
 */
export function guideStartDate(dob) {
  return addMonths(dob, 12);
}
