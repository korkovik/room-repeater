// @ts-check
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * @param {string} rel path relative to family-buddy/
 * @returns {unknown}
 */
export function readJson(rel) {
  return JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
}

/**
 * @typedef {{ key: string, dob: string, months: number, state: 'pre' | 'written' | 'unwritten' | 'post',
 *   stage?: string, start?: string, rr: boolean, en: string, cs: string }} DobRow
 */

/**
 * @returns {{ today: string, rows: DobRow[], rejected: { key: string, dob: string, error: string }[] }}
 */
export function dobFixtures() {
  const json = readJson('tests/fixtures/dob.json');
  if (typeof json !== 'object' || json === null || !('rows' in json) || !('today' in json) || !('rejected' in json)) {
    throw new Error('dob.json has an unexpected shape');
  }
  const { today, rows, rejected } = json;
  if (typeof today !== 'string' || !Array.isArray(rows) || !Array.isArray(rejected)) throw new Error('dob.json has an unexpected shape');
  return { today, rows, rejected };
}
