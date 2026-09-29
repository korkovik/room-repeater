import { expect, KEYS, openApp, openWithChild, profileJson, seed, stage, stored, test, tr } from './helpers.ts';

test('AC-16 edit DOB moves to the new stage; a future DOB is refused', async ({ page }) => {
  await openWithChild(page, '2025-01-31', 'cs');
  await page.getByRole('button', { name: 'Nastavení' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nastavení');
  await page.getByLabel('Datum narození').fill('2026-10-16');
  await page.getByRole('button', { name: 'Uložit' }).click();
  await expect(page.locator('#set-dob-error')).toHaveText(tr('cs', 'error.dobFuture'));
  expect(JSON.parse((await stored(page)) ?? '{}').children[0].dob).toBe('2025-01-31');

  await page.getByLabel('Datum narození').fill('2024-10-15');
  await page.getByRole('button', { name: 'Uložit' }).click();
  await expect(page.getByTestId('age-label')).toHaveText('2 roky');
  await expect(page.getByTestId('stage-card')).toHaveAttribute('data-id', 'm24-30');
  await expect(page.getByTestId('stage-card').getByRole('heading', { level: 2 })).toHaveText(stage('cs', 'm24-30').title);
  const saved = JSON.parse((await stored(page)) ?? '{}');
  expect(saved.children[0].dob).toBe('2024-10-15');
  expect(saved.children[0].id).toBe('c-0000000a');
});

test('edit validation parity: empty name and 72 months are refused (#62)', async ({ page }) => {
  await openWithChild(page, '2025-01-31');
  const before = await stored(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel("Child's name or nickname").fill('   ');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#set-name-error')).toHaveText('Enter a name or nickname');
  expect(await stored(page)).toBe(before);
  await page.getByLabel("Child's name or nickname").fill('Ema');
  await page.getByLabel('Date of birth').fill('2020-10-15');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#set-dob-error')).toHaveText('Family Buddy is for children up to 6 years');
  expect(await stored(page)).toBe(before);
});

test('edit name (#63)', async ({ page }) => {
  await openWithChild(page, '2025-01-31');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel("Child's name or nickname").fill('Emička');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('child-name')).toHaveText('Emička');
  expect(JSON.parse((await stored(page)) ?? '{}').children[0].name).toBe('Emička');
});

test('AC-17 forget: cancel changes nothing, confirm removes the key', async ({ page }) => {
  await openWithChild(page, '2025-01-31');
  const before = await stored(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Forget this child' }).click();
  const dialog = page.getByTestId('forget-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Delete Ema from this device? This can't be undone.");
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  expect(await stored(page)).toBe(before);

  await page.getByRole('button', { name: 'Forget this child' }).click();
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByLabel("Child's name or nickname")).toHaveValue('');
  await expect(page.getByLabel('Date of birth')).toHaveValue('');
  expect(await stored(page)).toBeNull();
});

test('AC-18 language change in settings is stored and survives a reload', async ({ page }) => {
  await openWithChild(page, '2025-01-31', 'cs');
  await page.getByRole('button', { name: 'Nastavení' }).click();
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const card = page.getByTestId('stage-card');
  await expect(card.getByRole('heading', { level: 2 })).toHaveText(stage('en', 'm18-24').title);
  await expect(card.locator('.insight')).toHaveText(stage('en', 'm18-24').insight);
  await expect(page.getByRole('button', { name: 'Indoor' })).toBeVisible();
  expect(JSON.parse((await stored(page)) ?? '{}').lang).toBe('en');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('age-label')).toHaveText('20 months');
});

test('language switch keeps the same stage and activity ids (#58)', async ({ page }) => {
  await openWithChild(page, '2025-01-31', 'cs');
  const ids = async () => page.getByTestId('activity-card').evaluateAll((els) => els.map((el) => el.getAttribute('data-id')));
  const csIds = await ids();
  await page.getByRole('button', { name: 'Nastavení' }).click();
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByTestId('stage-card')).toHaveAttribute('data-id', 'm18-24');
  expect(await ids()).toEqual(csIds);
});

test('two tabs: forgetting in one shows onboarding in the other (#76)', async ({ page, context }) => {
  await seed(page, KEYS.dev, profileJson('2025-01-31'));
  await openApp(page);
  const other = await context.newPage();
  await openApp(other);
  await expect(other.getByTestId('stage-card')).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Forget this child' }).click();
  await page.getByTestId('forget-dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(other.getByLabel("Child's name or nickname")).toBeVisible({ timeout: 5000 });
});

test('forget shows a notice when the browser refuses to delete (legal F5)', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.removeItem = function removeItem(this: Storage, key: string) {
      if (key.startsWith('fb-v1')) throw new DOMException('blocked', 'SecurityError');
    };
  });
  await openWithChild(page, '2025-01-31');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Forget this child' }).click();
  await page.getByTestId('forget-dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByTestId('forget-notice')).toHaveText(tr('en', 'notice.forgetFailed'));
  await expect(page.getByLabel("Child's name or nickname")).toHaveValue('');
});
