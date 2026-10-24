import { expect, test } from '@playwright/test';

const entry = process.env.APP_URL;
test.skip(!entry || !process.env.E2E_USERNAME || !process.env.E2E_PASSWORD);

test('demo settings has no redundant refresh toolbar', async ({ page }) => {
  test.setTimeout(120_000);
  const base = new URL(`${entry!.replace(/\/+$/, '')}/`);
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
  expect(login.status()).toBe(200);
  await page.goto(new URL('settings/demo', base).href);
  await expect(
    page.getByRole('button', { name: /^(Reset|重置)$/ }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByText(/^(Daily reset|每日重置)$/, { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Refresh|刷新/i })).toHaveCount(
    0,
  );
  if (process.env.DEMO_SCREENSHOT)
    await page.screenshot({
      path: process.env.DEMO_SCREENSHOT,
      fullPage: true,
    });
});
