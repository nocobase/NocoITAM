import { expect, test } from '@playwright/test';

const entry = process.env.APP_URL;
test.skip(
  !entry || !process.env.E2E_USERNAME || !process.env.E2E_PASSWORD,
  'Run against a dedicated Demo Mode database with test credentials.',
);

test('switches demo accounts from the header menu without a signed-in floating entry', async ({
  page,
}) => {
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
  await page.goto(new URL('devices', base).href);
  const trigger = page.getByRole('button', {
    name: /Open account menu|打开账户菜单|打开账号菜单/,
  });
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const submenu = page.getByRole('menuitem', {
    name: /Demo account|演示账号/,
  });
  await expect(submenu).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole('button', { name: /^(Enter|进入)$/ }),
  ).toHaveCount(0);
  await submenu.hover();
  const account = page.getByRole('menuitemradio', {
    name: process.env.E2E_DEMO_ACCOUNT_NAME ?? '孙强',
  });
  await expect(account).toBeVisible();
  if (process.env.MENU_SCREENSHOT)
    await page.screenshot({
      path: process.env.MENU_SCREENSHOT,
      fullPage: true,
    });
  await account.click();
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          new URL('api/auth/get-session', base).href,
        );
        return (await response.json())?.user?.username;
      },
      { timeout: 30_000 },
    )
    .toBe(process.env.E2E_DEMO_ACCOUNT_USERNAME ?? 'sunqiang');
  await expect(page).toHaveURL(new URL('devices', base).href);
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByRole('button', { name: /^(Enter|进入)$/ }),
  ).toHaveCount(0);
  if (process.env.E2E_DEMO_ACCOUNT_USERNAME === 'admin') {
    await page.goto(new URL('settings/demo', base).href);
    await expect(
      page.getByRole('button', { name: /^(Reset|重置)$/ }),
    ).toBeEnabled({ timeout: 30_000 });
    const write = await page.request.post(
      new URL('api/itam/devices', base).href,
      { data: {} },
    );
    expect(write.status()).toBe(400);
    expect(await write.json()).toMatchObject({
      error: { reason: 'DEMO_READ_ONLY' },
    });
  }
});
