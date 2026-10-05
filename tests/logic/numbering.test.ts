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

  it('rewinds a sequence to just past the highest number still in use', async () => {
    const numbering = app.container.resolve(numberingServiceToken);
    for (let index = 0; index < 5; index += 1)
      await numbering.next('purchaseOrder');
    const now = new Date();
    // PO-000002 is all that is left of the five; a number under another
    // prefix does not count.
    for (const orderNo of ['PO-000002', 'OLD-000009'])
      await app.db.database
        .query()
        .insertInto('purchaseOrders')
        .values({
          id: orderNo,
          orderNo,
          reason: 'newHire',
          status: 'draft',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    await numbering.rewind();
    expect(await numbering.next('purchaseOrder')).toBe('PO-000003');
    // Never forward: a record numbered past the sequence (written by hand
    // or imported) does not pull the sequence after it.
    await app.db.database
      .query()
      .insertInto('purchaseOrders')
      .values({
        id: 'PO-000040',
        orderNo: 'PO-000040',
        reason: 'newHire',
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await numbering.rewind();
    expect(await numbering.next('purchaseOrder')).toBe('PO-000004');
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
