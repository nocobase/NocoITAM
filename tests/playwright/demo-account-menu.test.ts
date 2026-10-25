import { expect, test } from '@playwright/test';

const entry = process.env.APP_URL;
test.skip(!entry, 'Run against a dedicated Demo Mode deployment.');

test('switches demo accounts from the header menu without a signed-in floating entry', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const base = new URL(`${entry!.replace(/\/+$/, '')}/`);
  // beta.3 automatically enters an existing Super Admin on the home page.
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
  await page.goto(new URL('devices', base).href);
  const trigger = page.getByRole('button', {
    name: /Open account menu|打开账户菜单|打开账号菜单/,
  });
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const submenu = page.getByRole('menuitem', {
    name: /^(Account:|账号[：:]|账户[：:])/,
  });
  await expect(submenu).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole('button', { name: /^(Enter|进入)$/ }),
  ).toHaveCount(0);
  await submenu.hover();
  await expect(
    page.getByRole('menuitemradio', { name: /Demo Admin|演示管理员/ }),
  ).toHaveCount(0);
  const account = page.getByRole('menuitemradio', {
    name: process.env.E2E_DEMO_ACCOUNT_NAME ?? 'Daniel Brooks',
  });
  await expect(account).toBeVisible();
  if (process.env.MENU_SCREENSHOT)
    await page.screenshot({
      path: process.env.MENU_SCREENSHOT,
      fullPage: true,
    });
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
  await expect(page).toHaveURL(new URL('devices', base).href);
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 60_000 });
  expect(await username()).toBe(
    process.env.E2E_DEMO_ACCOUNT_USERNAME ?? 'daniel',
  );
  await expect(
    page.getByRole('button', { name: /^(Enter|进入)$/ }),
  ).toHaveCount(0);
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
