import { expect, test } from '@playwright/test';

const entry = process.env.APP_URL;
test.skip(!entry, 'Run against a dedicated Demo Mode deployment.');

test('demo writes show one toast, restore inline values and keep form drafts', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const base = `${entry!.replace(/\/+$/, '')}/`;
  const status = await page.request.get(`${base}api/demoMode/status`);
  expect(await status.json()).toEqual({ data: { enabled: true } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // Public demo entry requires no password or saved browser session.
  const listed = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/api/itam/devices') &&
      response.request().method() === 'GET',
  );
  await page.goto(`${base}demo-sign-in?as=nocobase&redirect=/devices`);
  const records = (await (await listed).json()) as { data: { id: string }[] };
  expect(records.data.length).toBeGreaterThan(0);
  await page.goto(`${base}devices/${records.data[0]!.id}`);
  expect(errors).toEqual([]);
  const title = page.locator('h1 button[title]').first();
  await expect(title).toBeVisible({ timeout: 30_000 });
  const original = await title.innerText();
  await title.click();
  const editor = page.getByRole('textbox', { name: /Edit title|编辑标题/ });
  await editor.fill(`${original} demo check`);
  const refused = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      response.url().includes('/api/itam/devices/'),
  );
  await editor.press('Enter');
  const response = await refused;
  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({
    error: { reason: 'DEMO_READ_ONLY' },
  });
  await expect(editor).toHaveCount(0);
  await expect(title).toHaveText(original);
  const toast = page.locator('[data-slot="toast"]');
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText(/This is a demo|演示/);
  await expect(
    page.locator('h1').locator('..').locator('p.text-destructive'),
  ).toHaveCount(0);

  await page.goto(`${base}locations?new=1`);
  const form = page.locator('[data-slot="dialog-content"]');
  await expect(form).toBeVisible({ timeout: 30_000 });
  const name = form.locator('#form-name');
  const draft = 'Demo feedback test';
  await name.fill(draft);
  await form.locator('#form-type').click();
  await page.getByRole('option', { name: /^(Warehouse|仓库)$/ }).click();
  const submitted = page.waitForResponse(
    (result) =>
      result.request().method() === 'POST' &&
      result.url().includes('/api/itam/master/locations'),
  );
  await form.getByRole('button', { name: /^(Create|创建)$/ }).click();
  const result = await submitted;
  expect(result.status()).toBe(400);
  expect(await result.json()).toMatchObject({
    error: { reason: 'DEMO_READ_ONLY' },
  });
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText(/This is a demo|演示/);
  await expect(form).toBeVisible();
  await expect(name).toHaveValue(draft);
  await expect(form.locator('p.text-destructive')).toHaveCount(0);
  expect(errors).toEqual([]);
});
