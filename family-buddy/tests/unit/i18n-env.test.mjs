// @ts-check
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { bannerText, detectEnv, rrUrl, storageKey } from '../../dev/js/env.js';
import { detectLang, format, t, toDict } from '../../dev/js/i18n.js';
import { readJson, ROOT } from './helpers.mjs';

const cs = toDict(readJson('dev/i18n/cs.json'));
const en = toDict(readJson('dev/i18n/en.json'));

describe('i18n files (R2, #5–#7)', () => {
  test('identical key sets and no empty values', () => {
    assert.deepEqual(Object.keys(cs).sort(), Object.keys(en).sort());
    for (const [k, v] of [...Object.entries(cs), ...Object.entries(en)]) assert.ok(v.trim().length > 0, k);
  });
  test('spec EN strings are exact', () => {
    const expected = {
      'onboarding.privacyLine': 'Name and date of birth stay on this device only. A nickname is fine.',
      'onboarding.privacyLink': 'How we handle data',
      'error.nameEmpty': 'Enter a name or nickname',
      'error.dobEmpty': 'Enter the date of birth',
      'error.dobFuture': "Date of birth can't be in the future",
      'error.dobTooOld': 'Family Buddy is for children up to 6 years',
      'error.load': "Couldn't load the guide. Check your connection and reload.",
      'error.newerData': 'This app version is older than your data. Please reload.',
      'notice.storage': "This browser can't remember {name}. You'll need to enter the details next time.",
      'activities.safety': 'Always with an adult close by. Keep small objects away from children under 3.',
      'activities.none': 'No ideas for this age yet.',
      'state.pre': 'Guide starts at 12 months — on {date}',
      'state.post': "We're writing the guide for ages 5–6. Thanks for your patience.",
      'state.unwritten': "We're still writing the guide for {from}–{to} months.",
      'settings.forget': 'Forget this child',
      'settings.forgetConfirm': "Delete {name} from this device? This can't be undone.",
      'footer.disclaimer': "Not medical advice. Every child grows at their own pace. If anything about your child's development worries you, talk to your child's doctor.",
      'footer.aboutLink': 'About & sources',
      'footer.privacyLink': 'Privacy',
      'sources.furtherReading': 'Further reading',
      'about.furtherReadingTitle': 'Further reading on other websites',
      'notice.forgetFailed': "Couldn't delete the details. Clear this site's data in your browser settings.",
    };
    for (const [k, v] of Object.entries(expected)) assert.equal(en[k], v, k);
  });
  test('CS legal strings and the AC-1 / AC-13 fragments', () => {
    assert.equal(cs['onboarding.privacyLine'], 'Jméno a datum narození zůstanou jen v tomhle zařízení. Stačí přezdívka.');
    assert.equal(cs['onboarding.privacyLink'], 'Jak s údaji zacházíme');
    assert.equal(cs['activities.safety'], 'Vždy s dospělým nablízku. Drobné předměty drž z dosahu dětí do 3 let.');
    assert.equal(cs['footer.privacyLink'], 'Soukromí');
    assert.equal(cs['sources.furtherReading'], 'Další čtení');
    assert.equal(cs['about.furtherReadingTitle'], 'Další čtení na jiných webech');
    assert.equal(cs['notice.forgetFailed'], 'Údaje se nepodařilo smazat. Smaž data této stránky v nastavení prohlížeče.');
    assert.ok(t(cs, 'state.pre', { date: '1. března 2027' }).includes('od 12 měsíců — 1. března 2027'));
  });
  test('every CS string used by R6, R21–R23, R26, R27, R29 differs from EN', () => {
    for (const key of ['error.nameEmpty', 'error.dobEmpty', 'error.dobFuture', 'error.dobTooOld', 'state.pre', 'state.post', 'state.unwritten', 'settings.forgetConfirm', 'notice.storage', 'error.newerData', 'error.load', 'activities.none']) {
      assert.notEqual(cs[key], en[key], key);
    }
  });
  test('placeholders {{…}} survive formatting; {name} is replaced', () => {
    assert.equal(format('Hi {name}, {{CONTACT_EMAIL}} {other}', { name: 'Ema' }), 'Hi Ema, {{CONTACT_EMAIL}} {other}');
    assert.ok(t(en, 'about.what').includes('{{CONTROLLER_NAME}}'));
    assert.throws(() => t(en, 'no.such.key'));
  });
  test('detectLang (R1)', () => {
    assert.equal(detectLang('cs-CZ'), 'cs');
    assert.equal(detectLang('cs'), 'cs');
    assert.equal(detectLang('de-DE'), 'en');
    assert.equal(detectLang(undefined), 'en');
  });
});

describe('env.js (R3, R17)', () => {
  test('environment from path', () => {
    assert.equal(detectEnv('/room-repeater/family-buddy/dev/'), 'dev');
    assert.equal(detectEnv('/room-repeater/family-buddy/dev/privacy.en.html'), 'dev');
    assert.equal(detectEnv('/room-repeater/family-buddy/uat/'), 'uat');
    assert.equal(detectEnv('/family-buddy/'), 'prod');
    assert.equal(detectEnv('/family-buddy/developer/'), 'prod');
    assert.equal(detectEnv('/family-buddy/dev'), 'dev');
  });
  test('storage keys and RR URLs', () => {
    assert.deepEqual(/** @type {const} */ (['dev', 'uat', 'prod']).map((e) => storageKey(e)), ['fb-v1-dev', 'fb-v1-uat', 'fb-v1']);
    assert.equal(rrUrl('dev'), 'https://korkovik.github.io/room-repeater/dev/');
    assert.equal(rrUrl('uat'), 'https://korkovik.github.io/room-repeater/uat/');
    assert.equal(rrUrl('prod'), 'https://korkovik.github.io/room-repeater/');
  });
  test('banner text', () => {
    assert.equal(bannerText('dev', 'en'), 'DEV · test version, texts not yet reviewed');
    assert.equal(bannerText('uat', 'cs'), 'UAT · testovací verze, texty ještě neprošly kontrolou');
    assert.equal(bannerText('prod', 'en'), null);
  });
});

describe('static files', () => {
  test('no static noindex and no third-party references in dev/ (#82, #86)', () => {
    for (const file of ['index.html', 'privacy.cs.html', 'privacy.en.html']) {
      const html = readFileSync(path.join(ROOT, 'dev', file), 'utf8');
      assert.ok(!html.toLowerCase().includes('noindex'), file);
      // The legal text itself says "no analytics", so only attribute values (src/href) are checked.
      const refs = [...html.matchAll(/(?:src|href)="([^"]*)"/g)].map((m) => m[1] ?? '');
      for (const ref of refs) assert.ok(!/fonts\.googleapis|fonts\.gstatic|cdn\.|analytics|gtag/i.test(ref), `${file}: ${ref}`);
      const loaded = [...html.matchAll(/<(?:script|link)[^>]*(?:src|href)="([^"]*)"/g)].map((m) => m[1] ?? '');
      for (const ref of loaded) assert.ok(!/^[a-z]+:\/\//i.test(ref), `${file} loads ${ref}`);
    }
  });
  test('privacy pages are plain: only js/env.js, no innerHTML/localStorage/fetch (#104)', () => {
    for (const lang of ['cs', 'en']) {
      const html = readFileSync(path.join(ROOT, 'dev', `privacy.${lang}.html`), 'utf8');
      assert.deepEqual([...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]), ['js/env.js']);
      assert.ok(!/innerHTML|fetch\(/.test(html));
      // "localStorage" appears only inside the legal text, never in a script.
      assert.ok(!/<script(?![^>]*src=)[^>]*>/.test(html), 'no inline scripts');
      assert.ok(html.includes('https://uoou.gov.cz'));
      assert.ok(html.includes('(sessionStorage)'), 'legal F2 "Where" bullet');
      assert.ok(html.includes("form-action 'none'"));
      assert.ok(html.includes((lang === 'cs' ? cs : en)['footer.disclaimer'] ?? '∅'));
    }
  });
  test('reviewer allow-list (#96)', () => {
    assert.deepEqual(readJson('scripts/reviewers.json'), ['Tomáš Kořínek']);
  });
});
