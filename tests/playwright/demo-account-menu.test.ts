import { expect, test } from '@playwright/test';

const entry = process.env.APP_URL;
test.skip(!entry, 'Run against a dedicated Demo Mode deployment.');

test('switches demo accounts from the header and preserves the current location', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const base = new URL(`${entry!.replace(/\/+$/, '')}/`);
  // Anonymous home visitors enter the existing Super Admin.
  await page.goto(base.href);
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 60_000 });
  const username = async () => {
    const response = await page.request.get(
      new URL('api/auth/get-session', base).href,
    );
    expect(response.ok()).toBe(true);
    return (await response.json())?.user?.username;
  };
  expect(await username()).toBe(process.env.E2E_DEFAULT_USERNAME ?? 'nocobase');
  const destination = new URL('devices?view=list#demo-account', base).href;
  await page.goto(destination);
  const trigger = page.getByRole('button', {
    name: /Demo mode.*Switch account|演示模式.*切换账户/,
  });
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const account = page.getByRole('menuitemradio', {
    name: new RegExp(process.env.E2E_DEMO_ACCOUNT_NAME ?? 'Daniel Brooks'),
  });
  await expect(account).toBeVisible();
  // Switching ends the old session before issuing the new cookie. Wait for the
  // browser navigation before querying it, so an old-session response cannot
  // clear the new cookie while the switch is in flight.
  await Promise.all([
    page.waitForEvent('framenavigated', {
      predicate: (frame) => frame === page.mainFrame(),
      timeout: 30_000,
    }),
    account.click(),
  ]);
  await expect(page).toHaveURL(destination);
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 60_000 });
  expect(await username()).toBe(
    process.env.E2E_DEMO_ACCOUNT_USERNAME ?? 'daniel',
  );
  // Returning home must preserve the selected account instead of re-entering root.
  await page.goto(base.href);
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30_000 });
  expect(await username()).toBe(
    process.env.E2E_DEMO_ACCOUNT_USERNAME ?? 'daniel',
  );
  if ((process.env.E2E_DEMO_ACCOUNT_USERNAME ?? 'daniel') === 'daniel') {
    const management = await page.request.get(
      new URL('api/demoMode/configuration', base).href,
    );
    expect(management.status()).toBe(403);
  }
  const write = await page.request.post(
    new URL('api/itam/devices', base).href,
    { data: {} },
  );
  expect(write.status()).toBe(400);
  expect(await write.json()).toMatchObject({
    error: { reason: 'DEMO_READ_ONLY' },
  });
});
