// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  numberingServiceToken,
  settingsServiceToken,
} from '../../server/providers/itam/index.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

describe('numbering and settings services', () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('issues sequential numbers using the configured rule', async () => {
    const numbering = app.container.resolve(numberingServiceToken);
    expect(await numbering.next('device')).toBe('DE-000001');
    expect(await numbering.next('device')).toBe('DE-000002');
    expect(await numbering.next('purchaseOrder')).toBe('PO-000001');
  });

  it('does not consume a number when the surrounding transaction rolls back', async () => {
    const numbering = app.container.resolve(numberingServiceToken);
    await expect(
      app.db.database.transaction(async (connection) => {
        await numbering.next('device', { connection });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await numbering.next('device')).toBe('DE-000001');
  });

  it('merges stored settings over defaults and persists updates', async () => {
    const settings = app.container.resolve(settingsServiceToken);
    const defaults = await settings.get('thresholds');
    expect(defaults.warrantyDays).toBe(30);

    await settings.set('thresholds', { ...defaults, warrantyDays: 45 }, 'mia');
    const stored = await settings.get('thresholds');
    expect(stored.warrantyDays).toBe(45);
    expect(stored.idleDays).toBe(90);

    await settings.set('numbering', {
      ...(await settings.get('numbering')),
      device: { prefix: 'IT-', width: 4, start: 100 },
    });
    const numbering = app.container.resolve(numberingServiceToken);
    expect(await numbering.next('device')).toBe('IT-0100');
  });
});
