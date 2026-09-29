import { expect, KEYS, onboard, openApp, openWithChild, PATHS, stored, test, tr, type Env } from './helpers.ts';

/** HSL hue of a computed rgb() colour. */
function hue(rgb: string): number {
  const [r = 0, g = 0, b = 0] = (rgb.match(/\d+/g) ?? []).map((n) => Number(n) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const AC23: readonly { env: Env; banner: string | null; hue: readonly [number, number] | null }[] = [
  { env: 'dev', banner: 'DEV · test version, texts not yet reviewed', hue: [250, 300] },
  { env: 'uat', banner: 'UAT · test version, texts not yet reviewed', hue: [20, 45] },
  { env: 'prod', banner: null, hue: null },
];

test.describe('AC-23 environments', () => {
  for (const row of AC23) {
    test(`${PATHS[row.env]} → ${KEYS[row.env]}`, async ({ page, request }) => {
      await openApp(page, row.env);
      await onboard(page, 'Ema', '2025-01-31');
      await expect(page.getByTestId('stage-card')).toBeVisible();
      expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([KEYS[row.env]]);
      const banner = page.getByTestId('env-banner');
      const robots = page.locator('head meta[name="robots"][content="noindex"]');
      if (row.banner === null || row.hue === null) {
        await expect(banner).toHaveCount(0);
        await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
      } else {
        await expect(banner).toHaveText(row.banner);
        const h = hue(await banner.evaluate((el) => getComputedStyle(el).backgroundColor));
        expect(h).toBeGreaterThanOrEqual(row.hue[0]);
        expect(h).toBeLessThanOrEqual(row.hue[1]);
        await expect(robots).toHaveCount(1);
      }
      for (const file of ['', 'privacy.cs.html', 'privacy.en.html']) {
        const body = await (await request.get(`${PATHS[row.env]}${file}`)).text();
        expect(body.toLowerCase()).not.toContain('noindex');
      }
    });
  }
});

test.describe('Czech banner', () => {
  test.use({ locale: 'cs-CZ' });
  test('DEV banner follows the UI language (D14)', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('env-banner')).toHaveText('DEV · testovací verze, texty ještě neprošly kontrolou');
  });
});

test('environments are isolated (#83)', async ({ page }) => {
  await openApp(page, 'dev');
  await onboard(page, 'Ema', '2025-01-31');
  await expect(page.getByTestId('stage-card')).toBeVisible();
  await openApp(page, 'uat');
  await expect(page.getByLabel("Child's name or nickname")).toBeVisible();
});

test('privacy pages apply env chrome only off PROD (#84)', async ({ page }) => {
  await page.goto(`${PATHS.dev}privacy.en.html`);
  await expect(page.getByTestId('env-banner')).toHaveText('DEV · test version, texts not yet reviewed');
  await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1);
  await page.goto(`${PATHS.prod}privacy.en.html`);
  await expect(page.getByTestId('env-banner')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test('AC-24 no child data leaves the device, page weight ≤ 250 KB', async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://127.0.0.1').origin;
  const finished: Promise<{ url: string; bytes: number; headers: string; body: string }>[] = [];
  page.on('requestfinished', (request) => {
    finished.push((async () => {
      const sizes = await request.sizes();
      const headers = Object.values(await request.allHeaders()).join('\n');
      return { url: request.url(), bytes: sizes.responseBodySize, headers, body: request.postData() ?? '' };
    })());
  });
  await openApp(page);
  await onboard(page, 'Ema', '2025-01-31');
  await expect(page.getByTestId('stage-card')).toBeVisible();
  await page.getByRole('button', { name: 'Outdoor' }).click();
  await page.getByRole('link', { name: 'About & sources' }).click();
  await expect(page.getByTestId('about')).toBeVisible();
  const requests = await Promise.all(finished);
  expect(requests.length).toBeGreaterThan(0);
  let total = 0;
  for (const r of requests) {
    expect(new URL(r.url).origin).toBe(origin);
    for (const needle of ['Ema', '2025-01-31', '31.1.2025']) {
      expect(r.url).not.toContain(needle);
      expect(r.headers).not.toContain(needle);
      expect(r.body).not.toContain(needle);
    }
    total += r.bytes;
  }
  expect(total).toBeLessThanOrEqual(250_000);
});

for (const lang of ['en', 'cs'] as const) {
  test.describe(`AC-29 privacy screen (${lang})`, () => {
    test.use({ locale: lang === 'cs' ? 'cs-CZ' : 'en-GB' });

    test('reachable from onboarding, Back keeps the typed name, nothing stored', async ({ page }) => {
      await openApp(page);
      await page.getByLabel(tr(lang, 'onboarding.nameLabel')).fill('Ema');
      await page.getByRole('link', { name: tr(lang, 'onboarding.privacyLink') }).click();
      await expect(page).toHaveURL(new RegExp(`/dev/privacy\\.${lang}\\.html$`));
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      const text = page.getByTestId('privacy-text');
      await expect(text).toContainText('{{CONTROLLER_NAME}}');
      await expect(text).toContainText('{{CONTACT_EMAIL}}');
      await expect(text).toContainText('GitHub');
      await expect(text.getByRole('link', { name: 'https://uoou.gov.cz' })).toHaveAttribute('href', /^https:\/\/uoou\.gov\.cz\/?$/);
      await expect(page.getByTestId('footer').locator('p')).toHaveText(tr(lang, 'footer.disclaimer'));
      await page.getByRole('link', { name: lang === 'cs' ? 'Zpět' : 'Back' }).click();
      await expect(page.getByLabel(tr(lang, 'onboarding.nameLabel'))).toHaveValue('Ema');
      expect(await page.evaluate(() => localStorage.length)).toBe(0);
      expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
    });
  });
}

test('privacy from the dashboard footer and from About (#101)', async ({ page }) => {
  await openWithChild(page, '2025-01-31');
  await page.getByTestId('footer').getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/privacy\.en\.html$/);
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByTestId('stage-card')).toBeVisible();
  await page.getByRole('link', { name: 'About & sources' }).click();
  await expect(page.getByTestId('about')).toBeVisible();
  await page.getByTestId('footer').getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/privacy\.en\.html$/);
  await page.getByTestId('footer').getByRole('link', { name: 'About & sources' }).click();
  await expect(page.getByTestId('about')).toBeVisible();
});

test('the draft is written to sessionStorage only for the privacy page and removed once restored (#102, legal F2)', async ({ page }) => {
  await openApp(page);
  await page.getByLabel("Child's name or nickname").fill('Ema');
  await page.getByRole('button', { name: 'CS', exact: true }).click();
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).not.toContain('Ema');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain('Ema');
  await page.getByRole('link', { name: 'How we handle data' }).click();
  await expect(page).toHaveURL(/privacy\.en\.html$/);
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).toContain('Ema');
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByLabel("Child's name or nickname")).toHaveValue('Ema');
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  await page.getByLabel('Date of birth').fill('2025-01-31');
  await page.getByRole('button', { name: 'Show the guide' }).click();
  await expect(page.getByTestId('stage-card')).toBeVisible();
  expect(page.url()).not.toContain('?');
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).not.toContain('Ema');
  expect(await stored(page)).not.toBeNull();
});
