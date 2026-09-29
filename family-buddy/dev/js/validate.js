// @ts-check
/**
 * Input validation for onboarding and settings (spec R5, R6, BA5). Pure.
 */
import { addDays, addMonths, isValidDate, rawAgeMonths } from './age.js';

export const NAME_MAX = 40;
export const MAX_MONTHS_EXCLUSIVE = 72;

/** @typedef {'nameEmpty' | 'nameTooLong'} NameError */
/** @typedef {'dobEmpty' | 'dobFuture' | 'dobTooOld'} DobError */
/**
 * @typedef {{ ok: true, name: string, dob: string }
 *   | { ok: false, errors: { name?: NameError, dob?: DobError } }} ChildInputResult
 */

/**
 * Trims and checks the name: 1–40 characters counted as Unicode code points (test-plan D1).
 * @param {string} raw
 * @returns {{ ok: true, name: string } | { ok: false, error: NameError }}
 */
export function validateName(raw) {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, error: 'nameEmpty' };
  if ([...name].length > NAME_MAX) return { ok: false, error: 'nameTooLong' };
  return { ok: true, name };
}

/**
 * The JS check is authoritative (iOS may ignore min/max): not empty, not after today,
 * and younger than 72 months by R9.
 * @param {string} dob
 * @param {string} today
 * @returns {{ ok: true } | { ok: false, error: DobError }}
 */
export function validateDob(dob, today) {
  if (!isValidDate(dob)) return { ok: false, error: 'dobEmpty' };
  const months = rawAgeMonths(dob, today);
  if (months < 0 || dob > today) return { ok: false, error: 'dobFuture' };
  if (months >= MAX_MONTHS_EXCLUSIVE) return { ok: false, error: 'dobTooOld' };
  return { ok: true };
}

/**
 * @param {{ name: string, dob: string }} input
 * @param {string} today
 * @returns {ChildInputResult}
 */
export function validateChildInput(input, today) {
  const name = validateName(input.name);
  const dob = validateDob(input.dob, today);
  if (name.ok && dob.ok) return { ok: true, name: name.name, dob: input.dob };
  /** @type {{ name?: NameError, dob?: DobError }} */
  const errors = {};
  if (!name.ok) errors.name = name.error;
  if (!dob.ok) errors.dob = dob.error;
  return { ok: false, errors };
}

/**
 * min/max for the native date input (R5): max = today, min = today − 72 months + 1 day.
 * @param {string} today
 * @returns {{ min: string, max: string }}
 */
export function dobBounds(today) {
  return { min: addDays(addMonths(today, -MAX_MONTHS_EXCLUSIVE), 1), max: today };
}
