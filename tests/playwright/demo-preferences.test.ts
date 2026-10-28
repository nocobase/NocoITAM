import { expect, test, type Page } from '@playwright/test';

const entry = process.env.APP_URL;
test.skip(!entry, 'Run against a dedicated Demo Mode deployment.');

test('keeps plugin presentation preferences per visitor across account switches', async ({
  page,
  browser,
}) => {
  const base = new URL(`${entry!.replace(/\/+$/, '')}/`);
  const enter = async (visitor: Page, username = 'nocobase') => {
    await visitor.goto(
      new URL(`demo-sign-in?as=${username}&redirect=/devices`, base).href,
    );
    await expect(visitor).toHaveURL(new URL('devices', base).href);
    await expect(visitor.locator('h1').first()).toBeVisible({
      timeout: 60_000,
    });
  };
  await enter(page);
  const document = await page.request.get(new URL('api/swagger', base).href);
  expect(document.ok()).toBe(true);
  expect((await document.json()).paths).toHaveProperty(
    '/api/users/me/preferences',
  );
  const endpoint = new URL('api/users/me/preferences', base).href;
  const read = async (visitor: Page) => {
    const response = await visitor.request.get(endpoint);
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).data;
  };
  const defaults = await read(page);
  const choices = {
    locale: defaults.locale === 'zh-CN' ? 'en-US' : 'zh-CN',
    'theme.mode': defaults['theme.mode'] === 'dark' ? 'light' : 'dark',
    'theme.preset':
      defaults['theme.preset'] === 'compact' ? 'default' : 'compact',
  };
  const changed = await page.request.patch(endpoint, {
    data: choices,
    headers: { Origin: base.origin },
  });
  expect(changed.status(), await changed.text()).toBe(200);
  expect(await read(page)).toMatchObject(choices);

  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await enter(other);
    expect(await read(other)).toEqual(defaults);
    await enter(page, process.env.E2E_DEMO_ACCOUNT_USERNAME ?? 'daniel');
    expect(await read(page)).toMatchObject(choices);
    expect(await read(other)).toEqual(defaults);

    for (const key of Object.keys(choices)) {
      const removed = await page.request.delete(`${endpoint}/${key}`, {
        headers: { Origin: base.origin },
      });
      expect(removed.status()).toBe(204);
    }
    expect(await read(page)).toEqual(defaults);
  } finally {
    await otherContext.close();
  }
});
