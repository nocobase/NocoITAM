import { expect, test } from '@playwright/test';

const entry = process.env.APP_URL;
test.skip(!entry);

test('demo settings has no redundant refresh toolbar', async ({ page }) => {
  test.setTimeout(120_000);
  const base = new URL(`${entry!.replace(/\/+$/, '')}/`);
  await page.goto(
    new URL('demo-sign-in?as=admin&redirect=/settings/demo', base).href,
  );
  await expect(
    page.getByRole('button', { name: /^(Reset|重置)$/ }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByText(/^(Daily reset|每日重置)$/, { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Refresh|刷新/i })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: /^(Save|保存)$/ })).toHaveCount(
    0,
  );
  await expect(page.getByRole('switch')).toHaveCount(0);
  await expect(page.getByText(/03:00/).first()).toBeVisible();
  await expect(
    page.locator('a[href*="demo-sign-in?as=nocobase"]'),
  ).toBeVisible();
  if (process.env.DEMO_SCREENSHOT)
    await page.screenshot({
      path: process.env.DEMO_SCREENSHOT,
      fullPage: true,
    });
});
