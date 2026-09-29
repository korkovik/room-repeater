#!/usr/bin/env node
// @ts-check
/**
 * Content validator (spec C1–C7, C12).
 *
 *   node scripts/validate-content.mjs [--release] [--root <dir>]
 *
 * --root   directory laid out like family-buddy/ (default: the parent of this script's folder)
 * --release  also enforce C12: every reviewed.by is on scripts/reviewers.json, and no {{…}}
 *            placeholder remains in dev/i18n/*.json or dev/privacy.*.html
 *
 * Prints one line per violation, "<file> <id|-> C<n>: <message>", and exits 1 if there is any.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LANGS = /** @type {const} */ (['cs', 'en']);
const ALLOWED_LICENCES = ['public-domain', 'CC-BY-4.0', 'CC-BY-NC-SA-3.0-IGO', 'link-only', 'legal-text'];
const BANNED = {
  en: ['delay', 'diagnos', 'abnormal', 'disorder', 'should be able', 'must be able', 'red flag', 'on track', 'falling behind', 'screening', 'warning sign', 'normal development', 'milestone check'],
  cs: ['opožd', 'diagnó', 'diagnos', 'porucha', 'měl by umět', 'musí umět', 'varovn', 'zaostáv', 'screening', 'odchylk', 'v normě', 'normální vývoj', 'vyšetř'],
};
const ALL_BANNED = [...new Set([...BANNED.en, ...BANNED.cs])];
const LIMITS = { title: 60, insight: 400, takeaway: 140, step: 140, why: 160, minMinutes: 5, maxMinutes: 30, minSteps: 2, maxSteps: 5, takeaways: 3 };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** @typedef {{ file: string, id: string, rule: string, message: string }} Violation */

/**
 * @param {string[]} argv
 * @returns {{ release: boolean, root: string }}
 */
function parseArgs(argv) {
  let release = false;
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--release') release = true;
    else if (arg === '--root') {
      const value = argv[i + 1];
      if (value === undefined) throw new Error('--root needs a directory');
      root = path.resolve(value);
      i += 1;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return { release, root };
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isRealDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d;
}

/**
 * @param {string} s
 * @returns {number}
 */
function chars(s) {
  return [...s].length;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function idOf(value) {
  return isRecord(value) && typeof value.id === 'string' && value.id !== '' ? value.id : '-';
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isInt(value) {
  return typeof value === 'number' && Number.isInteger(value);
}

/**
 * @param {{ release: boolean, root: string }} options
 * @returns {{ violations: Violation[], summary: string }}
 */
export function validate({ release, root }) {
  /** @type {Violation[]} */
  const violations = [];
  /**
   * @param {string} file
   * @param {string} id
   * @param {string} rule
   * @param {string} message
   */
  const report = (file, id, rule, message) => violations.push({ file, id, rule, message });

  /**
   * @param {string} rel
   * @returns {unknown}
   */
  const readJson = (rel) => {
    const abs = path.join(root, rel);
    if (!existsSync(abs)) {
      report(rel, '-', 'C0', 'file is missing');
      return undefined;
    }
    try {
      return JSON.parse(readFileSync(abs, 'utf8'));
    } catch (error) {
      report(rel, '-', 'C0', `invalid JSON (${error instanceof Error ? error.message : String(error)})`);
      return undefined;
    }
  };

  // ---- C1: stage plan -------------------------------------------------------------------
  const planFile = 'dev/content/stage-plan.json';
  const planJson = readJson(planFile);
  /** @type {Map<string, { from: number, to: number }>} */
  const planStages = new Map();
  let coverageFrom = NaN;
  let coverageTo = NaN;
  if (isRecord(planJson)) {
    const coverage = planJson.coverage;
    if (isRecord(coverage) && isInt(coverage.fromMonths) && isInt(coverage.toMonths) && coverage.fromMonths < coverage.toMonths) {
      coverageFrom = coverage.fromMonths;
      coverageTo = coverage.toMonths;
    } else report(planFile, '-', 'C1', 'coverage needs integer fromMonths < toMonths');
    const list = Array.isArray(planJson.stages) ? planJson.stages : [];
    if (list.length === 0) report(planFile, '-', 'C1', 'stages must be a non-empty array');
    /** @type {{ id: string, from: number, to: number }[]} */
    const ranged = [];
    for (const s of list) {
      const id = idOf(s);
      if (!isRecord(s) || !isInt(s.ageFromMonths) || !isInt(s.ageToMonths) || s.ageFromMonths >= s.ageToMonths) {
        report(planFile, id, 'C1', 'needs integer ageFromMonths < ageToMonths');
        continue;
      }
      if (planStages.has(id)) report(planFile, id, 'C1', 'duplicate stage id');
      planStages.set(id, { from: s.ageFromMonths, to: s.ageToMonths });
      ranged.push({ id, from: s.ageFromMonths, to: s.ageToMonths });
    }
    ranged.sort((a, b) => a.from - b.from || a.to - b.to);
    const first = ranged[0];
    const last = ranged[ranged.length - 1];
    if (first && first.from !== coverageFrom) report(planFile, first.id, 'C1', `first stage starts at ${first.from}, coverage starts at ${coverageFrom}`);
    if (last && last.to !== coverageTo) report(planFile, last.id, 'C1', `last stage ends at ${last.to}, coverage ends at ${coverageTo}`);
    for (let i = 1; i < ranged.length; i += 1) {
      const prev = ranged[i - 1];
      const cur = ranged[i];
      if (!prev || !cur) continue;
      if (cur.from < prev.to) report(planFile, prev.id, 'C1', `range ${prev.from}–${prev.to} overlaps ${cur.id} (${cur.from}–${cur.to})`);
      else if (cur.from > prev.to) report(planFile, prev.id, 'C1', `gap between ${prev.id} (ends ${prev.to}) and ${cur.id} (starts ${cur.from})`);
    }
  } else if (planJson !== undefined) report(planFile, '-', 'C1', 'expected an object');

  // ---- per-language content ---------------------------------------------------------------
  /** @type {Record<string, { stages: Record<string, unknown>[], activities: Record<string, unknown>[], complete: unknown }>} */
  const byLang = {};
  for (const lang of LANGS) {
    const stagesFile = `dev/content/${lang}/stages.json`;
    const activitiesFile = `dev/content/${lang}/activities.json`;
    const stagesJson = readJson(stagesFile);
    const activitiesJson = readJson(activitiesFile);
    /** @type {Record<string, unknown>[]} */
    const stages = [];
    /** @type {Record<string, unknown>[]} */
    const activities = [];
    /** @type {unknown} */
    let complete;

    if (isRecord(stagesJson)) {
      if (stagesJson.schema !== 'fb-stages/1') report(stagesFile, '-', 'C3', 'schema must be "fb-stages/1"');
      if (stagesJson.lang !== lang) report(stagesFile, '-', 'C3', `lang must be "${lang}"`);
      if (typeof stagesJson.contentVersion !== 'string' || stagesJson.contentVersion === '') report(stagesFile, '-', 'C3', 'contentVersion is required');
      complete = isRecord(stagesJson.coverage) ? stagesJson.coverage.complete : undefined;
      if (typeof complete !== 'boolean') report(stagesFile, '-', 'C7', 'coverage.complete must be true or false');
      if (Array.isArray(stagesJson.stages)) {
        for (const s of stagesJson.stages) {
          if (isRecord(s)) stages.push(s);
          else report(stagesFile, '-', 'C4', 'stage entry must be an object');
        }
      } else report(stagesFile, '-', 'C4', 'stages must be an array');
    } else if (stagesJson !== undefined) report(stagesFile, '-', 'C4', 'expected an object');

    if (isRecord(activitiesJson)) {
      if (activitiesJson.schema !== 'fb-activities/1') report(activitiesFile, '-', 'C3', 'schema must be "fb-activities/1"');
      if (activitiesJson.lang !== lang) report(activitiesFile, '-', 'C3', `lang must be "${lang}"`);
      if (typeof activitiesJson.contentVersion !== 'string' || activitiesJson.contentVersion === '') report(activitiesFile, '-', 'C3', 'contentVersion is required');
      if (Array.isArray(activitiesJson.activities)) {
        for (const a of activitiesJson.activities) {
          if (isRecord(a)) activities.push(a);
          else report(activitiesFile, '-', 'C4', 'activity entry must be an object');
        }
      } else report(activitiesFile, '-', 'C4', 'activities must be an array');
    } else if (activitiesJson !== undefined) report(activitiesFile, '-', 'C4', 'expected an object');

    byLang[lang] = { stages, activities, complete };

    // C1: stage items match the plan and never overlap each other; activity ids are not plan ids.
    /** @type {Set<string>} */
    const seenStage = new Set();
    /** @type {{ id: string, from: number, to: number }[]} */
    const stageRanges = [];
    for (const s of stages) {
      const id = idOf(s);
      if (seenStage.has(id)) report(stagesFile, id, 'C1', 'duplicate id');
      seenStage.add(id);
      if (!isInt(s.ageFromMonths) || !isInt(s.ageToMonths) || s.ageFromMonths >= s.ageToMonths) {
        report(stagesFile, id, 'C1', 'needs integer ageFromMonths < ageToMonths');
        continue;
      }
      const planned = planStages.get(id);
      if (!planned) report(stagesFile, id, 'C1', 'id is not in stage-plan.json');
      else if (planned.from !== s.ageFromMonths || planned.to !== s.ageToMonths) {
        report(stagesFile, id, 'C1', `range ${s.ageFromMonths}–${s.ageToMonths} differs from stage-plan.json (${planned.from}–${planned.to})`);
      }
      for (const other of stageRanges) {
        if (s.ageFromMonths < other.to && other.from < s.ageToMonths) report(stagesFile, id, 'C1', `overlaps stage ${other.id}`);
      }
      stageRanges.push({ id, from: s.ageFromMonths, to: s.ageToMonths });
    }
    /** @type {Set<string>} */
    const seenActivity = new Set();
    for (const a of activities) {
      const id = idOf(a);
      if (id === '-') report(activitiesFile, id, 'C1', 'activity needs an id');
      if (seenActivity.has(id)) report(activitiesFile, id, 'C1', 'duplicate id');
      seenActivity.add(id);
      if (planStages.has(id)) report(activitiesFile, id, 'C1', 'activity id collides with a stage-plan id');
      if (!isInt(a.ageFromMonths) || !isInt(a.ageToMonths) || a.ageFromMonths >= a.ageToMonths) {
        report(activitiesFile, id, 'C1', 'needs integer ageFromMonths < ageToMonths');
      }
    }

    // C2: sources
    for (const [file, items] of /** @type {const} */ ([[stagesFile, stages], [activitiesFile, activities]])) {
      for (const item of items) {
        const id = idOf(item);
        const sources = item.sources;
        if (!Array.isArray(sources) || sources.length === 0) {
          report(file, id, 'C2', 'needs at least one source');
          continue;
        }
        // Legal F1: link-only sites are further reading. They may never be the first or only
        // source of our text. Module items (the Room Repeater link card) cite their own site.
        const first = sources[0];
        if (item.module === undefined && isRecord(first) && first.licence === 'link-only') {
          report(file, id, 'C2', 'sources[0] is link-only; cite a source we may build on first (link-only is further reading)');
        }
        sources.forEach((source, index) => {
          const where = `sources[${index}]`;
          if (!isRecord(source)) {
            report(file, id, 'C2', `${where} must be an object`);
            return;
          }
          /** @type {URL | null} */
          let url = null;
          try {
            url = typeof source.url === 'string' ? new URL(source.url) : null;
          } catch {
            url = null;
          }
          if (!url || url.protocol !== 'https:') report(file, id, 'C2', `${where}.url must be an https URL`);
          for (const field of ['publisher', 'title']) {
            const value = source[field];
            if (typeof value !== 'string' || value.trim() === '') report(file, id, 'C2', `${where}.${field} is required`);
          }
          if (!isRealDate(source.accessed)) report(file, id, 'C2', `${where}.accessed must be a YYYY-MM-DD date`);
          const licence = source.licence;
          if (licence === 'OGL-3.0') report(file, id, 'C2', `${where}.licence OGL-3.0 is not allowed in v1 (NHS is link-only)`);
          else if (typeof licence !== 'string' || !ALLOWED_LICENCES.includes(licence)) report(file, id, 'C2', `${where}.licence must be one of ${ALLOWED_LICENCES.join(', ')}`);
          if (url && (url.hostname === 'nhs.uk' || url.hostname.endsWith('.nhs.uk')) && licence !== 'link-only') {
            report(file, id, 'C2', `${where} is an nhs.uk source and must be licence "link-only"`);
          }
        });
      }
    }

    // C4: lengths
    /**
     * @param {string} file
     * @param {string} id
     * @param {unknown} value
     * @param {string} field
     * @param {number} max
     */
    const checkText = (file, id, value, field, max) => {
      if (typeof value !== 'string' || value.trim() === '') report(file, id, 'C4', `${field} is required`);
      else if (chars(value) > max) report(file, id, 'C4', `${field} is ${chars(value)} characters (max ${max})`);
    };
    for (const s of stages) {
      const id = idOf(s);
      checkText(stagesFile, id, s.title, 'title', LIMITS.title);
      checkText(stagesFile, id, s.insight, 'insight', LIMITS.insight);
      if (!Array.isArray(s.takeaways) || s.takeaways.length !== LIMITS.takeaways) {
        report(stagesFile, id, 'C4', `needs exactly ${LIMITS.takeaways} takeaways (has ${Array.isArray(s.takeaways) ? s.takeaways.length : 0})`);
      }
      (Array.isArray(s.takeaways) ? s.takeaways : []).forEach((tk, i) => checkText(stagesFile, id, tk, `takeaways[${i}]`, LIMITS.takeaway));
    }
    for (const a of activities) {
      const id = idOf(a);
      checkText(activitiesFile, id, a.title, 'title', LIMITS.title);
      checkText(activitiesFile, id, a.why, 'why', LIMITS.why);
      if (a.setting !== 'indoor' && a.setting !== 'outdoor') report(activitiesFile, id, 'C4', 'setting must be "indoor" or "outdoor"');
      if (!isInt(a.minutes) || a.minutes < LIMITS.minMinutes || a.minutes > LIMITS.maxMinutes) {
        report(activitiesFile, id, 'C4', `minutes must be an integer ${LIMITS.minMinutes}–${LIMITS.maxMinutes}`);
      }
      if (!Array.isArray(a.steps) || a.steps.length < LIMITS.minSteps || a.steps.length > LIMITS.maxSteps) {
        report(activitiesFile, id, 'C4', `needs ${LIMITS.minSteps}–${LIMITS.maxSteps} steps`);
      }
      (Array.isArray(a.steps) ? a.steps : []).forEach((st, i) => checkText(activitiesFile, id, st, `steps[${i}]`, LIMITS.step));
      if (a.module !== undefined && (typeof a.module !== 'string' || a.module === '')) report(activitiesFile, id, 'C4', 'module must be a non-empty string');
    }

    // C5: each written stage has ≥ 3 indoor and ≥ 3 outdoor non-module activities covering it
    for (const s of stages) {
      if (!isInt(s.ageFromMonths) || !isInt(s.ageToMonths)) continue;
      const from = s.ageFromMonths;
      const to = s.ageToMonths;
      for (const setting of ['indoor', 'outdoor']) {
        const count = activities.filter((a) => a.module === undefined && a.setting === setting && isInt(a.ageFromMonths) && isInt(a.ageToMonths) && a.ageFromMonths <= from && a.ageToMonths >= to).length;
        if (count < 3) report(stagesFile, idOf(s), 'C5', `has ${count} ${setting} activities covering ${from}–${to} (needs 3)`);
      }
    }

    // C6: banned words in content text
    /**
     * @param {string} file
     * @param {string} id
     * @param {string} field
     * @param {unknown} value
     */
    const checkWords = (file, id, field, value) => {
      if (typeof value !== 'string') return;
      const lower = value.toLocaleLowerCase(lang);
      for (const word of ALL_BANNED) {
        if (lower.includes(word)) report(file, id, 'C6', `${field} contains banned word "${word}"`);
      }
    };
    for (const s of stages) {
      const id = idOf(s);
      checkWords(stagesFile, id, 'title', s.title);
      checkWords(stagesFile, id, 'insight', s.insight);
      (Array.isArray(s.takeaways) ? s.takeaways : []).forEach((tk, i) => checkWords(stagesFile, id, `takeaways[${i}]`, tk));
      (Array.isArray(s.sources) ? s.sources : []).forEach((src, i) => { if (isRecord(src)) checkWords(stagesFile, id, `sources[${i}].title`, src.title); });
    }
    for (const a of activities) {
      const id = idOf(a);
      checkWords(activitiesFile, id, 'title', a.title);
      checkWords(activitiesFile, id, 'why', a.why);
      (Array.isArray(a.steps) ? a.steps : []).forEach((st, i) => checkWords(activitiesFile, id, `steps[${i}]`, st));
      (Array.isArray(a.sources) ? a.sources : []).forEach((src, i) => { if (isRecord(src)) checkWords(activitiesFile, id, `sources[${i}].title`, src.title); });
    }

    // C7: coverage.complete must be honest
    if (complete === true) {
      const written = new Set(stages.map(idOf));
      const missing = [...planStages.keys()].filter((id) => !written.has(id));
      if (missing.length > 0) report(stagesFile, '-', 'C7', `coverage.complete is true but stages are not written: ${missing.join(', ')}`);
    }

    // C6 + C12 on i18n strings
    const i18nFile = `dev/i18n/${lang}.json`;
    const dict = readJson(i18nFile);
    if (isRecord(dict)) {
      for (const [key, value] of Object.entries(dict)) {
        if (typeof value !== 'string') {
          report(i18nFile, key, 'C3', 'value must be a string');
          continue;
        }
        checkWords(i18nFile, key, 'text', value);
        if (release && value.includes('{{')) report(i18nFile, key, 'C12', `placeholder ${(value.match(/\{\{[^}]*\}\}?/g) ?? ['{{']).join(', ')} must be filled before release`);
      }
    } else if (dict !== undefined) report(i18nFile, '-', 'C3', 'expected an object');
  }

  // ---- C3: CS/EN parity -------------------------------------------------------------------
  const cs = byLang.cs;
  const en = byLang.en;
  if (cs && en) {
    for (const [kind, fields] of /** @type {const} */ ([['stages', ['ageFromMonths', 'ageToMonths']], ['activities', ['ageFromMonths', 'ageToMonths', 'setting', 'minutes', 'module']]])) {
      const csItems = new Map(cs[kind].map((i) => [idOf(i), i]));
      const enItems = new Map(en[kind].map((i) => [idOf(i), i]));
      for (const [id, item] of csItems) {
        const other = enItems.get(id);
        if (!other) {
          report(`dev/content/cs/${kind}.json`, id, 'C3', `id is missing in dev/content/en/${kind}.json`);
          continue;
        }
        for (const field of fields) {
          if (item[field] !== other[field]) report(`dev/content/cs/${kind}.json`, id, 'C3', `${field} differs from en (${String(item[field])} vs ${String(other[field])})`);
        }
      }
      for (const id of enItems.keys()) {
        if (!csItems.has(id)) report(`dev/content/en/${kind}.json`, id, 'C3', `id is missing in dev/content/cs/${kind}.json`);
      }
    }
  }
  const csDict = readJsonQuiet(path.join(root, 'dev/i18n/cs.json'));
  const enDict = readJsonQuiet(path.join(root, 'dev/i18n/en.json'));
  if (isRecord(csDict) && isRecord(enDict)) {
    for (const key of Object.keys(csDict)) if (!(key in enDict)) report('dev/i18n/cs.json', key, 'C3', 'key is missing in dev/i18n/en.json');
    for (const key of Object.keys(enDict)) if (!(key in csDict)) report('dev/i18n/en.json', key, 'C3', 'key is missing in dev/i18n/cs.json');
  }

  // ---- C12: release gate ------------------------------------------------------------------
  if (release) {
    const reviewersFile = 'scripts/reviewers.json';
    const reviewersJson = readJson(reviewersFile);
    const reviewers = Array.isArray(reviewersJson) ? reviewersJson.filter((r) => typeof r === 'string') : [];
    if (reviewers.length === 0) report(reviewersFile, '-', 'C12', 'must be a non-empty array of human reviewer names');
    for (const lang of LANGS) {
      const content = byLang[lang];
      if (!content) continue;
      for (const [kind, items] of /** @type {const} */ ([['stages', content.stages], ['activities', content.activities]])) {
        const file = `dev/content/${lang}/${kind}.json`;
        for (const item of items) {
          const id = idOf(item);
          const reviewed = isRecord(item.reviewed) ? item.reviewed : {};
          const by = reviewed.by;
          if (typeof by !== 'string' || !reviewers.includes(by)) {
            report(file, id, 'C12', `reviewed.by ${by === null || by === undefined ? 'is null' : `"${String(by)}" is not`} on ${reviewersFile}`);
          } else if (!isRealDate(reviewed.date)) report(file, id, 'C12', 'reviewed.date must be a YYYY-MM-DD date');
        }
      }
    }
    for (const lang of LANGS) {
      const rel = `dev/privacy.${lang}.html`;
      const abs = path.join(root, rel);
      if (!existsSync(abs)) {
        report(rel, '-', 'C12', 'file is missing');
        continue;
      }
      readFileSync(abs, 'utf8').split('\n').forEach((line, index) => {
        const found = line.match(/\{\{[^}]*\}\}?/g);
        if (found) report(rel, '-', 'C12', `line ${index + 1}: placeholder ${found.join(', ')} must be filled before release`);
      });
    }
  }

  const summary = `${LANGS.length} languages, ${planStages.size} plan stages, ${byLang.en?.stages.length ?? 0} written stages, ${byLang.en?.activities.length ?? 0} activities${release ? ', release checks on' : ''}`;
  return { violations, summary };
}

/**
 * @param {string} abs
 * @returns {unknown}
 */
function readJsonQuiet(abs) {
  try {
    return JSON.parse(readFileSync(abs, 'utf8'));
  } catch {
    return undefined;
  }
}

/** @returns {number} */
function main() {
  /** @type {{ release: boolean, root: string }} */
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\nusage: validate-content.mjs [--release] [--root <dir>]\n`);
    return 2;
  }
  const { violations, summary } = validate(options);
  // A closed pipe (e.g. `| head`) is not a validation failure of its own; keep the exit code.
  process.stdout.on('error', (error) => {
    if ('code' in error && error.code === 'EPIPE') process.exit(violations.length > 0 ? 1 : 0);
    throw error;
  });
  if (violations.length > 0) process.stdout.write(violations.map((v) => `${v.file} ${v.id} ${v.rule}: ${v.message}\n`).join(''));
  if (violations.length > 0) {
    process.stderr.write(`validate-content: ${violations.length} violation(s) (${summary})\n`);
    return 1;
  }
  process.stdout.write(`validate-content: OK (${summary})\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
