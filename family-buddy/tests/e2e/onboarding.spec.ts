import { expect, KEYS, onboard, openApp, openWithChild, stored, test, tr } from './helpers.ts';

test.describe('language and onboarding', () => {
  test.describe('Czech browser', () => {
    test.use({ locale: 'cs-CZ' });

    test('AC-1 Czech first open', async ({ page }) => {
      await openApp(page);
      await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
      await expect(page.getByLabel('Jméno nebo přezdívka dítěte')).toBeVisible();
      await expect(page.getByLabel('Datum narození')).toHaveAttribute('type', 'date');
      await expect(page.getByText('Jméno a datum narození zůstanou jen v tomhle zařízení. Stačí přezdívka.')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Jak s údaji zacházíme', exact: true })).toHaveAttribute('href', 'privacy.cs.html');
      expect(await page.evaluate(() => localStorage.length)).toBe(0);
    });

    test('onboarding stores the Czech language (#9)', async ({ page }) => {
      await openApp(page);
      await onboard(page, 'Ema', '2025-01-31', 'cs');
      await expect(page.getByTestId('age-label')).toHaveText('20 měsíců');
      expect(JSON.parse((await stored(page)) ?? '{}').lang).toBe('cs');
    });
  });

  test.describe('German browser', () => {
    test.use({ locale: 'de-DE' });

    test('AC-2 English default, switch to CS and back keeps the typed values', async ({ page }) => {
      await openApp(page);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.getByText(tr('en', 'onboarding.privacyLine'))).toBeVisible();
      await expect(page.getByRole('link', { name: 'How we handle data' })).toHaveAttribute('href', 'privacy.en.html');
      await page.getByLabel("Child's name or nickname").fill('Ema');
      await page.getByLabel('Date of birth').fill('2025-01-31');
      const url = page.url();
      await page.getByRole('button', { name: 'CS', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
      expect(page.url()).toBe(url);
      await expect(page.getByLabel('Jméno nebo přezdívka dítěte')).toHaveValue('Ema');
      await expect(page.getByLabel('Datum narození')).toHaveValue('2025-01-31');
      await expect(page.getByRole('link', { name: 'Jak s údaji zacházíme' })).toHaveAttribute('href', 'privacy.cs.html');
      expect(await stored(page)).toBeNull();
      await page.getByRole('button', { name: 'EN', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.getByLabel("Child's name or nickname")).toHaveValue('Ema');
      await expect(page.getByRole('link', { name: 'How we handle data' })).toHaveAttribute('href', 'privacy.en.html');
    });
  });

  test('AC-3 successful onboarding writes the schema', async ({ page }) => {
    await openApp(page);
    await onboard(page, ' Ema ', '2025-01-31');
    await expect(page.getByTestId('stage-card')).toBeVisible();
    const profile = JSON.parse((await stored(page)) ?? '{}');
    expect(profile.schemaVersion).toBe(1);
    expect(profile.lang).toBe('en');
    expect(profile.children).toHaveLength(1);
    expect(profile.children[0].name).toBe('Ema');
    expect(profile.children[0].dob).toBe('2025-01-31');
    expect(profile.children[0].id).toMatch(/^c-[0-9a-f]{8}$/);
    expect(profile.children[0].createdAt).toBe('2026-10-15');
    expect(profile.activeChildId).toBe(profile.children[0].id);
    expect(profile.done).toEqual([]);
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([KEYS.dev]);
  });

  test('AC-4 whitespace name is rejected next to the field', async ({ page }) => {
    await openApp(page);
    await onboard(page, '   ', '2025-01-31');
    const name = page.getByLabel("Child's name or nickname");
    await expect(page.locator('#onb-name-error')).toHaveText('Enter a name or nickname');
    await expect(name).toHaveAttribute('aria-describedby', 'onb-name-error');
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(await stored(page)).toBeNull();
  });

  test('missing DOB is rejected (#11) and both errors show at once (#15)', async ({ page }) => {
    await openApp(page);
    await onboard(page, 'Ema', '');
    await expect(page.locator('#onb-dob-error')).toHaveText('Enter the date of birth');
    await onboard(page, '', '');
    await expect(page.locator('#onb-name-error')).toHaveText('Enter a name or nickname');
    await expect(page.locator('#onb-dob-error')).toHaveText('Enter the date of birth');
    expect(await stored(page)).toBeNull();
  });

  test('AC-5 future DOB is rejected', async ({ page }) => {
    await openApp(page);
    await onboard(page, 'Ema', '2026-10-16');
    await expect(page.locator('#onb-dob-error')).toHaveText("Date of birth can't be in the future");
    expect(await stored(page)).toBeNull();
  });

  test('AC-6 exactly 72 months is rejected, 71 months is accepted', async ({ page }) => {
    await openApp(page);
    await onboard(page, 'Ema', '2020-10-15');
    await expect(page.locator('#onb-dob-error')).toHaveText('Family Buddy is for children up to 6 years');
    expect(await stored(page)).toBeNull();
    await onboard(page, 'Ema', '2020-10-16');
    await expect(page.getByTestId('state-message')).toHaveText(tr('en', 'state.post'));
    expect(JSON.parse((await stored(page)) ?? '{}').children[0].dob).toBe('2020-10-16');
  });

  test('privacy line and link sit above the submit button (legal F4); form is post-only (security MINOR 1)', async ({ page }) => {
    await openApp(page);
    const form = page.locator('form');
    await expect(form).toHaveAttribute('method', 'post');
    const order = await form.evaluate((el) => {
      const link = el.querySelector('a.block-link');
      const submit = el.querySelector('button[type="submit"]');
      return link !== null && submit !== null && Boolean(link.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(order).toBe(true);
    await onboard(page, 'Ema', '2025-01-31');
    await expect(page.getByTestId('stage-card')).toBeVisible();
    expect(page.url()).not.toContain('?');
  });

  test('date input bounds (#16)', async ({ page }) => {
    await openApp(page);
    const dob = page.getByLabel('Date of birth');
    await expect(dob).toHaveAttribute('max', '2026-10-15');
    await expect(dob).toHaveAttribute('min', '2020-10-16');
  });

  test('DOB today is accepted and shows the pre-range state (#17)', async ({ page }) => {
    await openApp(page);
    await onboard(page, 'Ema', '2026-10-15');
    await expect(page.getByTestId('child-header')).toContainText('Ema');
    await expect(page.getByTestId('age-label')).toHaveText('less than a week');
    await expect(page.getByTestId('state-message')).toHaveText('Guide starts at 12 months — on 15 October 2027');
  });

  test('AC-7 returning user goes straight to the dashboard', async ({ page }) => {
    await openWithChild(page, '2025-01-31');
    await expect(page.getByTestId('stage-card')).toBeVisible();
    await expect(page.getByLabel("Child's name or nickname")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('stage-card')).toBeVisible();
    await expect(page.getByLabel("Child's name or nickname")).toHaveCount(0);
  });

  test('40 × W name is accepted and truncated with an ellipsis (#19)', async ({ page }) => {
    const long = 'W'.repeat(40);
    await openApp(page);
    await onboard(page, long, '2025-01-31');
    const name = page.getByTestId('child-name');
    await expect(name).toHaveText(long);
    expect(await name.evaluate((el) => getComputedStyle(el).textOverflow)).toBe('ellipsis');
    expect(await name.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByLabel("Child's name or nickname")).toHaveValue(long);
  });

  test('emoji name is accepted (#20)', async ({ page }) => {
    await openApp(page);
    await onboard(page, '🦊', '2025-01-31');
    await expect(page.getByTestId('child-name')).toHaveText('🦊');
    expect(JSON.parse((await stored(page)) ?? '{}').children[0].name).toBe('🦊');
  });

  test('a 41st character cannot be typed (#21, maxlength 40)', async ({ page }) => {
    await openApp(page);
    const name = page.getByLabel("Child's name or nickname");
    await name.pressSequentially('W'.repeat(41));
    await expect(name).toHaveValue('W'.repeat(40));
  });

  test('AC-28 a name containing HTML is shown as text', async ({ page }) => {
    const evil = '<img src=x onerror=alert(1)>';
    page.on('dialog', (dialog) => {
      throw new Error(`unexpected dialog: ${dialog.message()}`);
    });
    await openApp(page);
    await onboard(page, evil, '2025-01-31');
    await expect(page.getByTestId('child-name')).toHaveText(evil);
    await expect(page.getByTestId('child-header').locator('img')).toHaveCount(0);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByLabel("Child's name or nickname")).toHaveValue(evil);
    await page.getByRole('button', { name: 'Forget this child' }).click();
    await expect(page.getByTestId('forget-dialog')).toContainText(`Delete ${evil} from this device? This can't be undone.`);
    await expect(page.locator('img')).toHaveCount(0);
  });
});
