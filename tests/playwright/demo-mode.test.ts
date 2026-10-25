import { expect, test } from '@playwright/test';

const entry = process.env.APP_URL;
test.skip(
  !entry || !process.env.E2E_USERNAME || !process.env.E2E_PASSWORD,
  'Run against a dedicated Demo Mode database with test credentials.',
);

const paths = [
  '/',
  '/inbox',
  '/devices',
  '/accessories',
  '/consumables',
  '/components',
  '/entitlements',
  '/procurement',
  '/repairs',
  '/audits',
  '/disposals',
  '/reports',
  '/master-data',
  '/categories',
  '/models',
  '/software-products',
  '/manufacturers',
  '/vendors',
  '/locations',
  '/departments',
  '/people',
  '/settings/itam',
  '/settings/mdm',
  '/settings/flows',
  '/settings/receipt-agent',
  '/settings/users',
  '/settings/permission-sets',
  '/settings/api-keys',
  '/settings/scheduled-tasks',
  '/settings/demo',
];

test('demo browsing and mutation refusal', async ({ page }) => {
  test.setTimeout(600_000);
  const base = new URL(`${entry!.replace(/\/+$/, '')}/`);
  const status = await page.request.get(
    new URL('api/demoMode/status', base).href,
  );
  expect(await status.json()).toEqual({ data: { enabled: true } });
  const login = await page.request.post(
    new URL('api/auth/sign-in/username', base).href,
    {
      data: {
        username: process.env.E2E_USERNAME,
        password: process.env.E2E_PASSWORD,
      },
      headers: { Origin: base.origin },
    },
  );
  expect(login.status(), await login.text()).toBe(200);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const failures: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/api/') && response.status() >= 400)
      failures.push(
        `${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`,
      );
  });
  for (const path of paths) {
    await test.step(path, async () => {
      await page.goto(new URL(path.replace(/^\//, ''), base).href);
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
      await page.waitForLoadState('networkidle');
      expect(errors, path).toEqual([]);
      expect(failures, path).toEqual([]);
      await expect(
        page.getByRole('heading', { name: /not found|access denied/i }),
      ).toHaveCount(0);
    });
  }
  // Management cards remain together; legacy tab links are ignored.
  for (const tab of ['overview', 'schedule', 'writes', 'simulation']) {
    await page.goto(new URL(`settings/demo?tab=${tab}`, base).href);
    await expect(
      page.getByText(/^(Daily reset|每日重置)$/, { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(/^(Accounts|账号)$/, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('tab', { name: /^(Overview|概览|Daily reset|每日重置)$/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /^(Reset|重置)$/ }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
  expect(failures).toEqual([]);
  if (process.env.DEMO_SCREENSHOT)
    await page.screenshot({
      path: process.env.DEMO_SCREENSHOT,
      fullPage: true,
    });
  const devices = (await (
    await page.request.get(new URL('api/itam/devices', base).href)
  ).json()) as { data: { id: string }[] };
  const deviceId = devices.data[0]?.id;
  expect(deviceId).toBeTruthy();
  for (const tab of ['history', 'related', 'attachments', 'documents']) {
    await page.goto(new URL(`devices/${deviceId}/${tab}`, base).href);
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
    expect(failures).toEqual([]);
  }
  const response = await page.request.post(
    new URL('api/itam/devices', base).href,
    { data: {}, headers: { 'accept-language': 'zh-CN' } },
  );
  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({
    error: { reason: 'DEMO_READ_ONLY' },
  });
});
