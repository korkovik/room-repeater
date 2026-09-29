import { AxeBuilder } from '@axe-core/playwright';
import { expect, onboard, openApp, openWithChild, test, type Lang } from './helpers.ts';
import type { Page } from '@playwright/test';

async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

async function noHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

/** R31 / D8: buttons, inputs, summaries and standalone links are ≥ 44×44 px; inline text links are excluded. */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector = 'button, input, select, summary, a.button, a.block-link, .footer nav a, .topbar a';
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((el) => el.offsetParent !== null)
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width < 44 || box.height < 44;
      })
      .map((el) => `${el.tagName.toLowerCase()} "${el.textContent?.trim() ?? ''}"`);
  });
}

test('AC-27 onboarding (with and without errors)', async ({ page }) => {
  await openApp(page);
  expect(await seriousViolations(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
  expect(await noHorizontalScroll(page)).toBe(true);
  await onboard(page, '', '');
  await expect(page.locator('#onb-name-error')).not.toBeEmpty();
  expect(await seriousViolations(page)).toEqual([]);
});

for (const lang of ['en', 'cs'] as const satisfies readonly Lang[]) {
  test(`AC-27 dashboard (${lang}) with sources open`, async ({ page }) => {
    await openWithChild(page, '2025-01-31', lang);
    await page.getByTestId('activity-card').first().locator('summary').click();
    expect(await seriousViolations(page)).toEqual([]);
    expect(await smallTargets(page)).toEqual([]);
    expect(await noHorizontalScroll(page)).toBe(true);
  });
}

test('AC-27 settings, forget dialog and About', async ({ page }) => {
  await openWithChild(page, '2025-01-31');
  await page.getByRole('button', { name: 'Settings' }).click();
  expect(await seriousViolations(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.getByRole('button', { name: 'Forget this child' }).click();
  expect(await seriousViolations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('link', { name: 'About & sources' }).click();
  await expect(page.getByTestId('about')).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
  expect(await noHorizontalScroll(page)).toBe(true);
});

test('privacy page has no serious violations', async ({ page }) => {
  await page.goto('/room-repeater/family-buddy/dev/privacy.cs.html');
  expect(await seriousViolations(page)).toEqual([]);
  expect(await noHorizontalScroll(page)).toBe(true);
});
