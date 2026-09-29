import { readFileSync } from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';

/** Spec AC preamble: today = 2026-10-15 local; noon keeps the date away from midnight (test-plan §1.2). */
export const TODAY = new Date('2026-10-15T12:00:00+02:00');

export const PATHS = {
  dev: '/room-repeater/family-buddy/dev/',
  uat: '/room-repeater/family-buddy/uat/',
  prod: '/family-buddy/',
} as const;
export type Env = keyof typeof PATHS;

export const KEYS: Readonly<Record<Env, string>> = { dev: 'fb-v1-dev', uat: 'fb-v1-uat', prod: 'fb-v1' };
export type Lang = 'cs' | 'en';

export interface SourceJson { title: string; publisher: string; url: string; accessed: string; licence: string }
export interface StageJson { id: string; ageFromMonths: number; ageToMonths: number; title: string; insight: string; takeaways: string[]; sources: SourceJson[] }
export interface ActivityJson { id: string; ageFromMonths: number; ageToMonths: number; setting: 'indoor' | 'outdoor'; minutes: number; title: string; steps: string[]; why: string; sources: SourceJson[]; module?: string }

function readJson(rel: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../dev/${rel}`, import.meta.url), 'utf8'));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Test-side view of the shipped files. The validator checks their shape, so a light guard is enough here. */
function listOf<T>(value: unknown, field: string): T[] {
  if (!isObject(value) || !Array.isArray(value[field])) throw new Error(`content file without ${field}[]`);
  return value[field];
}

export const content: Readonly<Record<Lang, { stages: StageJson[]; activities: ActivityJson[] }>> = {
  cs: { stages: listOf<StageJson>(readJson('content/cs/stages.json'), 'stages'), activities: listOf<ActivityJson>(readJson('content/cs/activities.json'), 'activities') },
  en: { stages: listOf<StageJson>(readJson('content/en/stages.json'), 'stages'), activities: listOf<ActivityJson>(readJson('content/en/activities.json'), 'activities') },
};

function dictOf(lang: Lang): Record<string, string> {
  const json = readJson(`i18n/${lang}.json`);
  if (!isObject(json)) throw new Error('i18n is not an object');
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(json)) if (typeof v === 'string') out[k] = v;
  return out;
}

export const i18n: Readonly<Record<Lang, Record<string, string>>> = { cs: dictOf('cs'), en: dictOf('en') };

export function stage(lang: Lang, id: string): StageJson {
  const found = content[lang].stages.find((s) => s.id === id);
  if (!found) throw new Error(`no stage ${id}`);
  return found;
}

export function activitiesFor(lang: Lang, months: number, setting: 'indoor' | 'outdoor'): ActivityJson[] {
  return content[lang].activities
    .filter((a) => a.module === undefined && a.setting === setting && a.ageFromMonths <= months && months < a.ageToMonths)
    .slice(0, 3);
}

export function profileJson(dob: string, lang: Lang = 'en', name = 'Ema'): string {
  return JSON.stringify({
    schemaVersion: 1,
    lang,
    activeChildId: 'c-0000000a',
    children: [{ id: 'c-0000000a', name, dob, createdAt: '2026-10-01' }],
    done: [],
  });
}

/** Writes localStorage on the same origin before the app loads (no addInitScript, test-plan §1.4). */
export async function seed(page: Page, key: string, value: string): Promise<void> {
  await page.goto('/__blank');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, value] as const);
}

export async function openApp(page: Page, env: Env = 'dev', clock: Date = TODAY): Promise<void> {
  await page.clock.setFixedTime(clock);
  await page.goto(PATHS[env]);
}

export async function openWithChild(page: Page, dob: string, lang: Lang = 'en', env: Env = 'dev', name = 'Ema'): Promise<void> {
  await seed(page, KEYS[env], profileJson(dob, lang, name));
  await openApp(page, env);
}

export async function stored(page: Page, key = KEYS.dev): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

export async function onboard(page: Page, name: string, dob: string, lang: Lang = 'en'): Promise<void> {
  const t = i18n[lang];
  await page.getByLabel(t['onboarding.nameLabel'] ?? '').fill(name);
  await page.getByLabel(t['onboarding.dobLabel'] ?? '').fill(dob);
  await page.getByRole('button', { name: t['onboarding.submit'] ?? '' }).click();
}

export function tr(lang: Lang, key: string): string {
  const value = i18n[lang][key];
  if (value === undefined) throw new Error(`missing i18n ${key}`);
  return value;
}

interface Guards {
  /** Set to true in tests that expect failed requests (they log console errors). */
  allowConsoleErrors: boolean;
  errors: string[];
  foreign: string[];
}

/** Global guards (test-plan §1.6): no uncaught errors, no request to another origin. */
export const test = base.extend<{ guards: Guards }>({
  guards: [
    async ({ page, baseURL }, use) => {
      const origin = new URL(baseURL ?? 'http://127.0.0.1').origin;
      const guards: Guards = { allowConsoleErrors: false, errors: [], foreign: [] };
      page.on('pageerror', (error) => guards.errors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error' && !guards.allowConsoleErrors) guards.errors.push(`console: ${message.text()}`);
      });
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.protocol.startsWith('http') && url.origin !== origin) guards.foreign.push(request.url());
      });
      await use(guards);
      expect(guards.errors, 'uncaught errors / console errors').toEqual([]);
      expect(guards.foreign, 'requests to another origin').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
