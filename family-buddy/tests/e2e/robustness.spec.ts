import { expect, KEYS, onboard, openApp, openWithChild, profileJson, seed, stored, test } from './helpers.ts';

test('AC-19 setItem throws: session-only dashboard with a notice', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    };
  });
  await openApp(page);
  await onboard(page, 'Ema', '2025-01-31');
  await expect(page.getByTestId('storage-notice')).toHaveText("This browser can't remember Ema. You'll need to enter the details next time.");
  await expect(page.getByTestId('stage-card')).toBeVisible();
  await page.getByRole('button', { name: 'Outdoor' }).click();
  await expect(page.getByRole('button', { name: 'Outdoor' })).toHaveAttribute('aria-pressed', 'true');
});

test('localStorage access itself throws (#68)', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  });
  await openApp(page);
  await onboard(page, 'Ema', '2025-01-31');
  await expect(page.getByTestId('storage-notice')).toBeVisible();
  await expect(page.getByTestId('stage-card')).toBeVisible();
});

test('getItem throws on load: onboarding shows (#69)', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
  });
  await openApp(page);
  await expect(page.getByLabel("Child's name or nickname")).toBeVisible();
});

test('AC-20 corrupt JSON: onboarding, key unchanged until submit', async ({ page }) => {
  await seed(page, KEYS.dev, '{not json');
  await openApp(page);
  await expect(page.getByLabel("Child's name or nickname")).toBeVisible();
  expect(await stored(page)).toBe('{not json');
  await page.getByLabel("Child's name or nickname").fill('Ema');
  expect(await stored(page)).toBe('{not json');
  await page.getByLabel('Date of birth').fill('2025-01-31');
  await page.getByRole('button', { name: 'Show the guide' }).click();
  await expect(page.getByTestId('stage-card')).toBeVisible();
  expect(JSON.parse((await stored(page)) ?? '{}').schemaVersion).toBe(1);
});

test.describe('schema-invalid data is treated as empty (#71)', () => {
  const cases = [
    '{"schemaVersion":1}',
    '{"schemaVersion":1,"lang":"cs","activeChildId":"c-0000000a","children":[{"id":"c-0000000a","name":"Ema","createdAt":"2026-10-01"}],"done":[]}',
    profileJson('31.1.2025'),
  ];
  for (const [i, raw] of cases.entries()) {
    test(`case ${i + 1}`, async ({ page }) => {
      await seed(page, KEYS.dev, raw);
      await openApp(page);
      await expect(page.getByLabel("Child's name or nickname")).toBeVisible();
      expect(await stored(page)).toBe(raw);
    });
  }
});

test('AC-21 newer schema: read-only message, storage never touched', async ({ page }) => {
  const raw = '{"schemaVersion":2,"lang":"en","children":[],"done":[]}';
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.defineProperty(window, '__fbWrites', { value: calls });
    for (const method of ['setItem', 'removeItem', 'clear'] as const) {
      const original = Storage.prototype[method];
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value(this: Storage, ...args: string[]) {
          if (location.pathname !== '/__blank') calls.push(`${method}:${args[0] ?? ''}`);
          return Reflect.apply(original, this, args);
        },
      });
    }
  });
  await seed(page, KEYS.dev, raw);
  await openApp(page);
  const message = page.getByTestId('app-message');
  await expect(message).toContainText('This app version is older than your data.');
  await expect(message).toContainText('Please reload.');
  const appWrites = async () => {
    const writes: unknown = await page.evaluate(() => Reflect.get(window, '__fbWrites'));
    return Array.isArray(writes) ? writes.filter((w: unknown) => typeof w === 'string' && w.endsWith(':fb-v1-dev')) : ['spy missing'];
  };
  expect(await appWrites()).toEqual([]);
  await page.getByRole('button', { name: 'Reload' }).click();
  await expect(page.getByTestId('app-message')).toBeVisible();
  expect(await appWrites()).toEqual([]);
  expect(await stored(page)).toBe(raw);
});

for (const mode of ['abort', '404'] as const) {
  test(`content fails to load (${mode}) and Reload recovers (#75)`, async ({ page, guards }) => {
    guards.allowConsoleErrors = true;
    await page.route('**/content/**/stages.json', (route) => (mode === 'abort' ? route.abort() : route.fulfill({ status: 404, body: 'nope' })));
    await openWithChild(page, '2025-01-31');
    await expect(page.getByTestId('app-message')).toHaveText("Couldn't load the guide. Check your connection and reload.");
    expect(await stored(page)).toBe(profileJson('2025-01-31'));
    await page.unroute('**/content/**/stages.json');
    await page.getByRole('button', { name: 'Reload' }).click();
    await expect(page.getByTestId('stage-card')).toBeVisible();
  });
}
