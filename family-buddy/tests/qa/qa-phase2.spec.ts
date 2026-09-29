/**
 * QA phase-2 checks (qa-tester, 2026-09-28). Independent of the developer's specs; reference = spec.md,
 * legal-review-b1.md §3 F1 and test-plan.md. Scenario numbers refer to qa-report.md.
 */
import { content, expect, i18n, KEYS, openApp, openWithChild, profileJson, seed, stored, test, tr, type Lang, type SourceJson } from '../e2e/helpers.ts';

const LINK_ONLY_HOSTS = /(^|\.)(nhs\.uk|unicef\.org)$/;
const isLinkOnlySource = (s: SourceJson): boolean => s.licence === 'link-only' || LINK_ONLY_HOSTS.test(new URL(s.url).hostname);

const WRITTEN: readonly { dob: string; stageId: string; months: number }[] = [
  { dob: '2025-01-31', stageId: 'm18-24', months: 20 },
  { dob: '2024-10-15', stageId: 'm24-30', months: 24 },
  { dob: '2022-06-01', stageId: 'm48-60', months: 52 },
];

test.describe('#113 legal F1: link-only sources (NHS/UNICEF) appear only under "Further reading"', () => {
  for (const lang of ['en', 'cs'] as const) {
    for (const row of WRITTEN) {
      test(`${lang} ${row.stageId}: stage card and all activity cards, both settings`, async ({ page }) => {
        await openWithChild(page, row.dob, lang);
        await expect(page.getByTestId('stage-card')).toHaveAttribute('data-id', row.stageId);
        const byId = new Map<string, SourceJson[]>([
          ...content[lang].stages.map((s) => [s.id, s.sources] as [string, SourceJson[]]),
          ...content[lang].activities.map((a) => [a.id, a.sources] as [string, SourceJson[]]),
        ]);
        let checkedLinkOnly = 0;
        for (const setting of ['indoor', 'outdoor'] as const) {
          await page.getByRole('button', { name: tr(lang, `activities.${setting}`) }).click();
          const cards = page.locator('[data-testid="stage-card"], [data-testid="activity-card"]');
          const count = await cards.count();
          expect(count).toBe(4);
          for (let i = 0; i < count; i++) {
            const card = cards.nth(i);
            const id = (await card.getAttribute('data-id')) ?? '';
            const sources = byId.get(id);
            expect(sources, `content item ${id}`).toBeDefined();
            await card.locator('summary').click();
            const cited = (sources ?? []).filter((s) => !isLinkOnlySource(s));
            const further = (sources ?? []).filter(isLinkOnlySource);
            expect(cited.length, `${id} must have a non-link-only source first`).toBeGreaterThan(0);
            await expect(card.getByTestId('cited-sources').locator('a')).toHaveCount(cited.length);
            for (const s of cited) await expect(card.getByTestId('cited-sources').locator(`a[href="${s.url}"]`)).toHaveCount(1);
            await expect(card.getByTestId('cited-sources').locator('a[href*="nhs.uk"], a[href*="unicef.org"]')).toHaveCount(0);
            if (further.length === 0) {
              await expect(card.getByTestId('further-reading')).toHaveCount(0);
            } else {
              const box = card.getByTestId('further-reading');
              await expect(box.locator('.further-title')).toHaveText(tr(lang, 'sources.furtherReading'));
              await expect(box.locator('a')).toHaveCount(further.length);
              for (const s of further) await expect(box.locator(`a[href="${s.url}"]`)).toHaveCount(1);
              // the further-reading block comes after the cited block
              expect(await card.evaluate((el) => {
                const c = el.querySelector('[data-testid="cited-sources"]');
                const f = el.querySelector('[data-testid="further-reading"]');
                return c !== null && f !== null && Boolean(c.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING);
              })).toBe(true);
              checkedLinkOnly += further.length;
            }
          }
        }
        test.info().annotations.push({ type: 'link-only sources checked', description: String(checkedLinkOnly) });
      });
    }

    test(`${lang} About: link-only sources only in the further-reading list`, async ({ page }) => {
      await openWithChild(page, '2025-01-31', lang);
      await page.getByRole('link', { name: tr(lang, 'footer.aboutLink') }).click();
      const about = page.getByTestId('about');
      await expect(about).toBeVisible();
      const all = new Map<string, SourceJson>();
      for (const item of [...content[lang].stages, ...content[lang].activities]) for (const s of item.sources) if (!all.has(s.url)) all.set(s.url, s);
      const cited = [...all.values()].filter((s) => !isLinkOnlySource(s)).map((s) => s.url);
      const further = [...all.values()].filter(isLinkOnlySource).map((s) => s.url);
      expect(further.length).toBeGreaterThan(0);
      const hrefs = async (testId: string) => page.getByTestId(testId).locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
      expect((await hrefs('source-list')).sort()).toEqual([...cited].sort());
      expect((await hrefs('further-reading-list')).sort()).toEqual([...further].sort());
      await expect(page.getByTestId('source-list').locator('a[href*="nhs.uk"], a[href*="unicef.org"]')).toHaveCount(0);
      await expect(about.getByRole('heading', { name: tr(lang, 'about.furtherReadingTitle') })).toBeVisible();
      // R20 order of the legal paragraphs, OGL never shown
      const keys = await about.locator('[data-key]').evaluateAll((ps) => ps.map((p) => p.getAttribute('data-key')));
      expect(keys).toEqual(['about.what', 'about.notMedical', 'about.how', 'about.safety', 'about.cdc', 'about.who', 'about.links', 'about.rr']);
      await expect(about).not.toContainText(i18n[lang]['about.ogl'] ?? 'Open Government Licence');
      // #57: source titles are plain text inside the links
      expect(await page.getByTestId('source-list').locator('a').evaluateAll((as) => as.every((a) => a.children.length === 0))).toBe(true);
    });
  }
});

test.describe('#118 security MINOR 2: an invalid stored name is treated as no profile', () => {
  for (const [label, name] of [['41 characters', 'W'.repeat(41)], ['blank', '   ']] as const) {
    test(label, async ({ page }) => {
      const raw = profileJson('2025-01-31', 'en', name);
      await seed(page, KEYS.dev, raw);
      await openApp(page);
      await expect(page.getByLabel("Child's name or nickname")).toBeVisible();
      await expect(page.getByTestId('stage-card')).toHaveCount(0);
      expect(await stored(page)).toBe(raw);
    });
  }
});

test.describe('#124 privacy round trip keeps the whole draft (BA11)', () => {
  test.use({ locale: 'cs-CZ' });
  test('name, DOB and language survive Privacy → Back; nothing in localStorage', async ({ page }) => {
    await openApp(page);
    await page.getByLabel(tr('cs', 'onboarding.nameLabel')).fill('Ema');
    await page.getByLabel(tr('cs', 'onboarding.dobLabel')).fill('2025-01-31');
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await page.getByRole('link', { name: tr('en', 'onboarding.privacyLink') }).click();
    await expect(page).toHaveURL(/privacy\.en\.html$/);
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByLabel(tr('en', 'onboarding.nameLabel'))).toHaveValue('Ema');
    await expect(page.getByLabel(tr('en', 'onboarding.dobLabel'))).toHaveValue('2025-01-31');
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  });
});

test.describe('#125 Czech happy path end to end', () => {
  test.use({ locale: 'cs-CZ' });
  test('onboard in Czech → Czech dashboard with CS stage, activities and RR card', async ({ page }) => {
    const lang: Lang = 'cs';
    await openApp(page);
    await page.getByLabel(tr(lang, 'onboarding.nameLabel')).fill(' Ema ');
    await page.getByLabel(tr(lang, 'onboarding.dobLabel')).fill('2025-01-31');
    await page.getByRole('button', { name: tr(lang, 'onboarding.submit') }).click();
    await expect(page.getByTestId('child-name')).toHaveText('Ema');
    await expect(page.getByTestId('age-label')).toHaveText('20 měsíců');
    const stageJson = content.cs.stages.find((s) => s.id === 'm18-24');
    await expect(page.getByTestId('stage-card').locator('h2, h3').first()).toHaveText(stageJson?.title ?? '');
    await expect(page.getByTestId('stage-card').locator('li').filter({ hasNotText: /citováno/ })).toHaveCount(3);
    await expect(page.getByTestId('activity-card')).toHaveCount(3);
    await expect(page.getByTestId('rr-card').getByRole('link')).toHaveAttribute('href', 'https://korkovik.github.io/room-repeater/dev/');
    await expect(page.getByTestId('footer').locator('p')).toHaveText(tr(lang, 'footer.disclaimer'));
    expect(JSON.parse((await stored(page)) ?? '{}').lang).toBe('cs');
  });
});
