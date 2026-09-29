import { activitiesFor, content, expect, openApp, openWithChild, seed, stage, stored, test, tr, KEYS, profileJson, type Lang } from './helpers.ts';

const AC8: readonly { dob: string; lang: Lang; label: string; stage: string }[] = [
  { dob: '2025-01-31', lang: 'cs', label: '20 měsíců', stage: 'm18-24' },
  { dob: '2024-10-16', lang: 'en', label: '23 months', stage: 'm18-24' },
  { dob: '2024-10-15', lang: 'cs', label: '2 roky', stage: 'm24-30' },
  { dob: '2022-06-01', lang: 'cs', label: '4 roky a 4 měsíce', stage: 'm48-60' },
  { dob: '2022-06-01', lang: 'en', label: '4 years 4 months', stage: 'm48-60' },
];

test.describe('AC-8 age label and stage', () => {
  for (const row of AC8) {
    test(`${row.dob} ${row.lang} → ${row.label} / ${row.stage}`, async ({ page }) => {
      await openWithChild(page, row.dob, row.lang);
      await expect(page.getByTestId('child-name')).toHaveText('Ema');
      await expect(page.getByTestId('age-label')).toHaveText(row.label);
      const expected = stage(row.lang, row.stage);
      const card = page.getByTestId('stage-card');
      await expect(card).toHaveAttribute('data-id', row.stage);
      await expect(card.getByRole('heading', { level: 2 })).toHaveText(expected.title);
      await expect(card.locator('.insight')).toHaveText(expected.insight);
      await expect(card.getByRole('heading', { name: tr(row.lang, 'stage.takeawaysHeading') })).toBeVisible();
      await expect(card.locator('.takeaways li')).toHaveText(expected.takeaways);
    });
  }
});

test('AC-9 indoor/outdoor activities with the safety line, no module items', async ({ page }) => {
  await openWithChild(page, '2025-01-31');
  const indoor = page.getByRole('button', { name: 'Indoor' });
  await expect(indoor).toHaveAttribute('aria-pressed', 'true');
  const section = page.getByTestId('activities');
  const safety = section.getByTestId('safety');
  await expect(safety).toHaveText('Always with an adult close by. Keep small objects away from children under 3.');
  const cards = section.getByTestId('activity-card');
  const expectedIndoor = activitiesFor('en', 20, 'indoor');
  expect(expectedIndoor).toHaveLength(3);
  await expect(cards.locator('h3')).toHaveText(expectedIndoor.map((a) => a.title));
  expect(await safety.evaluate((el) => {
    const first = document.querySelector('[data-testid="activity-card"]');
    return first !== null && Boolean(el.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  for (const [i, activity] of expectedIndoor.entries()) {
    const card = cards.nth(i);
    await expect(card.locator('.minutes')).toHaveText(`${activity.minutes} min`);
    const steps = await card.locator('ol li').count();
    expect(steps).toBeGreaterThanOrEqual(2);
    expect(steps).toBeLessThanOrEqual(5);
    await expect(card.getByRole('heading', { name: 'Why it helps' })).toBeVisible();
    await expect(card.locator('.why')).toHaveText(activity.why);
    await expect(card.locator('summary')).toHaveText('Sources');
  }
  const rrTitle = content.en.activities.find((a) => a.module === 'room-repeater')?.title ?? '';
  await expect(section.getByText(rrTitle)).toHaveCount(0);

  await page.getByRole('button', { name: 'Outdoor' }).click();
  await expect(page.getByRole('button', { name: 'Outdoor' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('safety')).toBeVisible();
  await expect(page.getByTestId('activity-card').locator('h3')).toHaveText(activitiesFor('en', 20, 'outdoor').map((a) => a.title));
  await expect(page.getByTestId('activities').getByText(rrTitle)).toHaveCount(0);
});

test('toggle is not persisted (#49)', async ({ page }) => {
  await openWithChild(page, '2025-01-31');
  const before = await stored(page);
  await page.getByRole('button', { name: 'Outdoor' }).click();
  expect(await stored(page)).toBe(before);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Indoor' })).toHaveAttribute('aria-pressed', 'true');
});

test('Czech toggle labels and safety line (#50)', async ({ page }) => {
  await openWithChild(page, '2025-01-31', 'cs');
  await expect(page.getByRole('button', { name: 'Doma' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Venku' })).toBeVisible();
  await expect(page.getByTestId('safety')).toHaveText('Vždy s dospělým nablízku. Drobné předměty drž z dosahu dětí do 3 let.');
});

test('AC-10 sources expand with publisher, linked title and accessed date', async ({ page }) => {
  await openWithChild(page, '2025-01-31');
  const first = activitiesFor('en', 20, 'indoor')[0];
  if (!first) throw new Error('no activity');
  const card = page.getByTestId('activity-card').first();
  await card.getByText('Sources').click();
  const items = card.locator('details li');
  await expect(items).toHaveCount(first.sources.length);
  for (const [i, source] of first.sources.entries()) {
    const item = items.nth(i);
    await expect(item).toContainText(source.publisher);
    await expect(item).toContainText('accessed 28 September 2026');
    const link = item.getByRole('link', { name: source.title });
    await expect(link).toHaveAttribute('href', source.url);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  }
  // Legal F1: link-only sites sit under "Further reading", after the cited sources.
  await expect(card.getByTestId('cited-sources').locator('a[href*="nhs.uk"], a[href*="unicef.org"]')).toHaveCount(0);
  const further = card.getByTestId('further-reading');
  await expect(further).toContainText('Further reading');
  await expect(further.locator('a[href*="nhs.uk"]')).toHaveCount(first.sources.filter((s) => s.url.includes('nhs.uk')).length);
  const stageCard = page.getByTestId('stage-card');
  await stageCard.getByText('Sources').click();
  await expect(stageCard.locator('details li')).toHaveCount(stage('en', 'm18-24').sources.length);
});

const AC11 = [
  { months: 17, dob: '2025-05-15', env: 'dev', url: null },
  { months: 18, dob: '2025-04-15', env: 'dev', url: 'https://korkovik.github.io/room-repeater/dev/' },
  { months: 47, dob: '2022-11-15', env: 'uat', url: 'https://korkovik.github.io/room-repeater/uat/' },
  { months: 48, dob: '2022-10-15', env: 'dev', url: null },
  { months: 20, dob: '2025-01-31', env: 'prod', url: 'https://korkovik.github.io/room-repeater/' },
] as const;

test.describe('AC-11 Room Repeater card', () => {
  for (const row of AC11) {
    test(`${row.months} months on ${row.env} → ${row.url ?? 'hidden'}`, async ({ page }) => {
      await openWithChild(page, row.dob, 'en', row.env);
      await expect(page.getByTestId('footer')).toBeVisible();
      const card = page.getByTestId('rr-card');
      if (row.url === null) {
        await expect(card).toHaveCount(0);
        return;
      }
      const link = card.getByRole('link', { name: 'Open Room Repeater' });
      await expect(link).toHaveAttribute('href', row.url);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', /noopener/);
      const href = (await link.getAttribute('href')) ?? '';
      expect(href).not.toMatch(/[?#]/);
      await expect(card.getByRole('heading')).toHaveText(content.en.activities.find((a) => a.module === 'room-repeater')?.title ?? '');
      expect(await card.evaluate((el) => {
        const before = document.querySelector('[data-testid="activities"], [data-testid="state-message"]');
        return before !== null && Boolean(before.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
      })).toBe(true);
    });
  }
});

test('AC-12 stage not written yet', async ({ page }) => {
  await openWithChild(page, '2023-04-15');
  await expect(page.getByTestId('state-message')).toHaveText("We're still writing the guide for 42–48 months.");
  await expect(page.getByTestId('rr-card')).toBeVisible();
  await expect(page.getByTestId('footer')).toBeVisible();
  await expect(page.getByTestId('stage-card')).toHaveCount(0);
  await expect(page.getByTestId('activity-card')).toHaveCount(0);
});

test('other unwritten stages use the plan (#47)', async ({ page }) => {
  await openWithChild(page, '2025-10-15');
  await expect(page.getByTestId('state-message')).toHaveText("We're still writing the guide for 12–15 months.");
  await seed(page, KEYS.dev, profileJson('2024-04-15'));
  await openApp(page);
  await expect(page.getByTestId('state-message')).toHaveText("We're still writing the guide for 30–36 months.");
});

test('AC-13 pre-range in Czech and English', async ({ page }) => {
  await openWithChild(page, '2026-03-01', 'cs');
  await expect(page.getByTestId('state-message')).toContainText('od 12 měsíců — 1. března 2027');
  await expect(page.getByTestId('stage-card')).toHaveCount(0);
  await expect(page.getByTestId('activity-card')).toHaveCount(0);
  await expect(page.getByTestId('rr-card')).toHaveCount(0);
  await expect(page.getByTestId('footer')).toBeVisible();
  await seed(page, KEYS.dev, profileJson('2026-03-01', 'en'));
  await openApp(page);
  await expect(page.getByTestId('state-message')).toHaveText('Guide starts at 12 months — on 1 March 2027');
});

test('AC-14 post-range at 65 months', async ({ page }) => {
  await openWithChild(page, '2021-05-10');
  await expect(page.getByTestId('state-message')).toHaveText("We're writing the guide for ages 5–6. Thanks for your patience.");
  await expect(page.getByTestId('footer')).toBeVisible();
  await expect(page.getByTestId('rr-card')).toHaveCount(0);
  await expect(page.getByTestId('stage-card')).toHaveCount(0);
});

test('post-range starts at exactly 60 months (#44)', async ({ page }) => {
  await openWithChild(page, '2021-10-15');
  await expect(page.getByTestId('age-label')).toHaveText('5 years');
  await expect(page.getByTestId('state-message')).toHaveText(tr('en', 'state.post'));
});

test.describe('AC-15 footer in every state', () => {
  for (const dob of ['2025-01-31', '2023-04-15', '2026-03-01', '2021-05-10']) {
    test(`footer for ${dob}`, async ({ page }) => {
      await openWithChild(page, dob);
      const footer = page.getByTestId('footer');
      await expect(footer).toContainText(tr('en', 'footer.disclaimer'));
      await expect(footer.getByRole('link', { name: 'About & sources' })).toBeVisible();
      await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', 'privacy.en.html');
    });
  }
});

for (const lang of ['en', 'cs'] as const) {
  test(`AC-15 About & sources (${lang})`, async ({ page }) => {
    await openWithChild(page, '2025-01-31', lang);
    await page.getByRole('link', { name: tr(lang, 'footer.aboutLink') }).click();
    const about = page.getByTestId('about');
    await expect(about.getByRole('heading', { level: 1 })).toHaveText(tr(lang, 'about.title'));
    const keys = await about.locator('[data-key]').evaluateAll((els) => els.map((el) => el.getAttribute('data-key')));
    expect(keys).toEqual(['about.what', 'about.notMedical', 'about.how', 'about.safety', 'about.cdc', 'about.who', 'about.links', 'about.rr']);
    for (const key of keys) await expect(about.locator(`[data-key="${key}"]`)).toHaveText(tr(lang, key ?? ''));
    const cdc = about.locator('[data-key="about.cdc"]');
    await expect(cdc).toContainText('cdc.gov');
    await expect(cdc).toContainText(lang === 'en' ? 'free of charge' : 'zdarma');
    await expect(page.getByText('Open Government Licence')).toHaveCount(0);
    const allSources = [...content[lang].stages, ...content[lang].activities].flatMap((i) => i.sources);
    const unique = (list: typeof allSources) => [...new Set(list.map((s) => s.url))];
    const hrefs = (testId: string) => page.getByTestId(testId).getByRole('link').evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    expect(await hrefs('source-list')).toEqual(unique(allSources.filter((s) => s.licence !== 'link-only')));
    expect(await hrefs('further-reading-list')).toEqual(unique(allSources.filter((s) => s.licence === 'link-only')));
    // Legal F1: NHS / UNICEF are further reading only, never listed as sources of our text.
    await expect(page.getByTestId('source-list').locator('a[href*="nhs.uk"], a[href*="unicef.org"]')).toHaveCount(0);
    await expect(page.getByTestId('further-reading-list').locator('a[href*="nhs.uk"]').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: tr(lang, 'about.furtherReadingTitle') })).toBeVisible();
    await expect(page.getByTestId('footer')).toContainText(tr(lang, 'footer.disclaimer'));
    await page.getByRole('button', { name: tr(lang, 'about.back') }).click();
    await expect(page.getByTestId('stage-card')).toBeVisible();
  });
}

test('AC-22 day rollover updates the age on visibilitychange', async ({ page }) => {
  await seed(page, KEYS.dev, profileJson('2024-10-15', 'cs'));
  await openApp(page, 'dev', new Date('2026-10-14T23:59:00+02:00'));
  await expect(page.getByTestId('age-label')).toHaveText('23 měsíců');
  await expect(page.getByTestId('stage-card')).toHaveAttribute('data-id', 'm18-24');
  await page.clock.setFixedTime(new Date('2026-10-15T00:01:00+02:00'));
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('age-label')).toHaveText('2 roky');
  await expect(page.getByTestId('stage-card')).toHaveAttribute('data-id', 'm24-30');
});

test('stored DOB in the future (wrong phone clock) shows pre-range (#74)', async ({ page }) => {
  await openWithChild(page, '2026-11-01');
  await expect(page.getByTestId('age-label')).toHaveText('less than a week');
  await expect(page.getByTestId('state-message')).toHaveText('Guide starts at 12 months — on 1 November 2027');
  expect(await stored(page)).toBe(profileJson('2026-11-01'));
});
