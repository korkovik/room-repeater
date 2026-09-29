// @ts-check
/**
 * AC-25 / C1–C7, C12: runs scripts/validate-content.mjs as a CLI against mutated copies
 * of the project in a temp dir (--root), never against the repo files.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { ROOT } from './helpers.mjs';

const SCRIPT = path.join(ROOT, 'scripts/validate-content.mjs');
/** @type {string[]} */
const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** @returns {string} a fresh copy of the files the validator reads */
function fixtureRoot() {
  const dir = mkdtempSync(path.join(tmpdir(), 'fb-validate-'));
  temps.push(dir);
  for (const rel of ['dev/content', 'dev/i18n', 'dev/privacy.cs.html', 'dev/privacy.en.html', 'scripts/reviewers.json']) {
    cpSync(path.join(ROOT, rel), path.join(dir, rel), { recursive: true });
  }
  return dir;
}

/**
 * @param {string} root
 * @param {string} rel
 * @param {(json: any) => void} mutate
 */
function editJson(root, rel, mutate) {
  const file = path.join(root, rel);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  mutate(json);
  writeFileSync(file, JSON.stringify(json, null, 2));
}

/**
 * @param {string | null} root
 * @param {boolean} [release]
 * @returns {{ status: number | null, out: string }}
 */
function run(root, release = false) {
  const args = [SCRIPT];
  if (release) args.push('--release');
  if (root) args.push('--root', root);
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

/**
 * @param {{ status: number | null, out: string }} result
 * @param {string} file
 * @param {string} id
 * @param {string} rule
 */
function assertViolation(result, file, id, rule) {
  assert.notEqual(result.status, 0, result.out);
  const lines = result.out.split('\n');
  assert.ok(lines.some((line) => line.startsWith(`${file} ${id} ${rule}: `)), `expected "${file} ${id} ${rule}:" in:\n${result.out}`);
}

/** @param {string} root */
function release(root) {
  for (const lang of ['cs', 'en']) {
    for (const file of /** @type {const} */ (['stages', 'activities'])) {
      editJson(root, `dev/content/${lang}/${file}.json`, (json) => {
        for (const item of json[file]) item.reviewed = { by: 'Tomáš Kořínek', date: '2026-10-20' };
      });
    }
    editJson(root, `dev/i18n/${lang}.json`, (json) => {
      for (const key of Object.keys(json)) json[key] = json[key].replace(/\{\{[A-Z_]+\}\}/g, 'filled');
    });
    const html = path.join(root, `dev/privacy.${lang}.html`);
    writeFileSync(html, readFileSync(html, 'utf8').replace(/\{\{[A-Z_]+\}\}/g, 'filled'));
  }
}

describe('baseline (#87)', () => {
  test('unchanged repo passes', () => {
    const result = run(null);
    assert.equal(result.status, 0, result.out);
    assert.match(result.out, /validate-content: OK/);
  });
  test('unknown argument exits 2', () => {
    const result = spawnSync(process.execPath, [SCRIPT, '--nope'], { encoding: 'utf8' });
    assert.equal(result.status, 2);
  });
});

describe('AC-25 mutations (#88)', () => {
  /** @type {[string, (root: string) => void, string, string, string][]} */
  const cases = [
    ['(a) overlapping stage range', (r) => editJson(r, 'dev/content/stage-plan.json', (j) => { j.stages.find((/** @type {any} */ s) => s.id === 'm18-24').ageToMonths = 25; }), 'dev/content/stage-plan.json', 'm18-24', 'C1'],
    ['(b) missing source', (r) => editJson(r, 'dev/content/en/activities.json', (j) => { j.activities[1].sources = []; }), 'dev/content/en/activities.json', 'a-sock-pairs', 'C2'],
    ['(c) OGL-3.0 licence', (r) => editJson(r, 'dev/content/en/activities.json', (j) => { j.activities[1].sources[0].licence = 'OGL-3.0'; }), 'dev/content/en/activities.json', 'a-sock-pairs', 'C2'],
    ['(d) nhs.uk not link-only', (r) => editJson(r, 'dev/content/en/activities.json', (j) => { j.activities[1].sources[0] = { ...j.activities[1].sources[0], url: 'https://www.nhs.uk/baby/', licence: 'public-domain' }; }), 'dev/content/en/activities.json', 'a-sock-pairs', 'C2'],
    ['(e) id only in CS', (r) => editJson(r, 'dev/content/cs/activities.json', (j) => { j.activities.push({ ...j.activities[1], id: 'a-only-cs' }); }), 'dev/content/cs/activities.json', 'a-only-cs', 'C3'],
    ['(f) 4th takeaway', (r) => editJson(r, 'dev/content/en/stages.json', (j) => { j.stages[1].takeaways.push('One more thing.'); }), 'dev/content/en/stages.json', 'm24-30', 'C4'],
    ['(g) step of 141 characters', (r) => editJson(r, 'dev/content/cs/activities.json', (j) => { j.activities[1].steps[0] = 'x'.repeat(141); }), 'dev/content/cs/activities.json', 'a-sock-pairs', 'C4'],
    ['(h) "opožděný" in a CS takeaway', (r) => editJson(r, 'dev/content/cs/stages.json', (j) => { j.stages[0].takeaways[0] = 'Dítě je opožděný.'; }), 'dev/content/cs/stages.json', 'm18-24', 'C6'],
    ['(i) "on track" in an EN insight', (r) => editJson(r, 'dev/content/en/stages.json', (j) => { j.stages[2].insight += ' Is your child on track?'; }), 'dev/content/en/stages.json', 'm48-60', 'C6'],
    ['(j) complete: true with unwritten stages', (r) => { for (const l of ['cs', 'en']) editJson(r, `dev/content/${l}/stages.json`, (j) => { j.coverage.complete = true; }); }, 'dev/content/en/stages.json', '-', 'C7'],
    ['(k) C5 one outdoor activity too few', (r) => { for (const l of ['cs', 'en']) editJson(r, `dev/content/${l}/activities.json`, (j) => { j.activities = j.activities.filter((/** @type {any} */ a) => a.id !== 'a-shadow-tag'); }); }, 'dev/content/en/stages.json', 'm48-60', 'C5'],
    ['(l) http source', (r) => editJson(r, 'dev/content/en/stages.json', (j) => { j.stages[0].sources[0].url = 'http://www.cdc.gov/'; }), 'dev/content/en/stages.json', 'm18-24', 'C2'],
    ['(m) "red flag" in an i18n string', (r) => editJson(r, 'dev/i18n/en.json', (j) => { j['activities.none'] = 'No red flag here.'; }), 'dev/i18n/en.json', 'activities.none', 'C6'],
    ['(n) minutes 31', (r) => { for (const l of ['cs', 'en']) editJson(r, `dev/content/${l}/activities.json`, (j) => { j.activities[1].minutes = 31; }); }, 'dev/content/en/activities.json', 'a-sock-pairs', 'C4'],
    ['(o) minutes differ CS vs EN', (r) => editJson(r, 'dev/content/cs/activities.json', (j) => { j.activities[1].minutes = 12; }), 'dev/content/cs/activities.json', 'a-sock-pairs', 'C3'],
    ['link-only source listed first', (r) => editJson(r, 'dev/content/en/activities.json', (j) => { j.activities[1].sources.reverse(); }), 'dev/content/en/activities.json', 'a-sock-pairs', 'C2'],
    ['link-only as the only source', (r) => editJson(r, 'dev/content/cs/activities.json', (j) => { j.activities[1].sources = j.activities[1].sources.filter((/** @type {any} */ x) => x.licence === 'link-only'); }), 'dev/content/cs/activities.json', 'a-sock-pairs', 'C2'],
    ['i18n key only in CS', (r) => editJson(r, 'dev/i18n/cs.json', (j) => { j['extra.key'] = 'navíc'; }), 'dev/i18n/cs.json', 'extra.key', 'C3'],
    ['stage id not in the plan', (r) => editJson(r, 'dev/content/en/stages.json', (j) => { j.stages[0].id = 'm18-23'; }), 'dev/content/en/stages.json', 'm18-23', 'C1'],
  ];
  for (const [name, mutate, file, id, rule] of cases) {
    test(name, () => {
      const root = fixtureRoot();
      mutate(root);
      assertViolation(run(root), file, id, rule);
    });
  }
  test('length boundary is inclusive: 140 characters pass (#89)', () => {
    const root = fixtureRoot();
    editJson(root, 'dev/content/cs/activities.json', (j) => { j.activities[1].steps[0] = 'x'.repeat(140); });
    const result = run(root);
    assert.equal(result.status, 0, result.out);
  });
});

describe('C12 --release (#91–#95)', () => {
  test('fails on the unchanged B1 content (reviewed.by null, placeholders)', () => {
    const result = run(null, true);
    assertViolation(result, 'dev/content/en/stages.json', 'm18-24', 'C12');
    assertViolation(result, 'dev/privacy.cs.html', '-', 'C12');
    assertViolation(result, 'dev/i18n/en.json', 'about.what', 'C12');
  });
  test('passes on a fully released fixture', () => {
    const root = fixtureRoot();
    release(root);
    const result = run(root, true);
    assert.equal(result.status, 0, result.out);
  });
  test('fails when a reviewer is an agent', () => {
    const root = fixtureRoot();
    release(root);
    editJson(root, 'dev/content/en/activities.json', (j) => { j.activities[3].reviewed.by = 'ba-product-owner'; });
    assertViolation(run(root, true), 'dev/content/en/activities.json', 'a-teddy-picnic', 'C12');
  });
  test('fails on a leftover placeholder in privacy.cs.html, plain run still passes', () => {
    const root = fixtureRoot();
    release(root);
    const html = path.join(root, 'dev/privacy.cs.html');
    writeFileSync(html, readFileSync(html, 'utf8').replace('</main>', '<p>{{CONTACT_EMAIL}}</p></main>'));
    assertViolation(run(root, true), 'dev/privacy.cs.html', '-', 'C12');
    assert.equal(run(root).status, 0);
  });
});
