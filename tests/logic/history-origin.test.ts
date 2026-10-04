// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHistoryService } from '../../server/providers/itam/history.js';
import {
  createTestDatabase,
  type TestDatabase,
} from '../support/test-database.js';

/**
 * `actorId` says whose decision a line was; `origin` says how it reached the
 * record. The pair is the point: a write the assistant proposed carries
 * `agent` *and* the user who confirmed its card, because the plugin holds the
 * call until somebody does.
 */
describe('what put a line on the timeline', () => {
  let db: TestDatabase;
  beforeEach(async () => {
    db = await createTestDatabase();
  });
  afterEach(async () => {
    await db.destroy();
  });

  const subject = { subjectType: 'devices', subjectId: 'device-1' };
  const history = () => createHistoryService(db.database);

  it('is human unless the writer says otherwise', async () => {
    await history().record({
      ...subject,
      type: 'assign',
      summary: 'Assigned',
      actorId: 'user-1',
    });
    const [item] = (await history().timeline(subject)).data;
    expect(item?.origin).toBe('human');
  });

  it('keeps the confirming person while naming the assistant', async () => {
    await history().record({
      ...subject,
      type: 'assign',
      summary: 'Assigned',
      actorId: 'user-1',
      origin: 'agent',
      sourceType: 'aiAction',
    });
    const [item] = (await history().timeline(subject)).data;
    expect(item?.origin).toBe('agent');
    expect(item?.actorId).toBe('user-1');
  });

  it('reads a value back as the text it was, digits included', async () => {
    // A user id the users plugin issues is all digits; parsed as JSON it
    // came back a number, and the timeline showed the id instead of a name.
    await history().log({
      ...subject,
      action: 'update',
      field: 'ownerId',
      oldValue: 'e000c207-1a27-459c-9b84-c15a8e1b23bc',
      newValue: '390266703839233',
      actorId: 'user-1',
    });
    const [item] = (await history().timeline(subject)).data;
    expect(item?.changes[0]?.oldValue).toBe(
      'e000c207-1a27-459c-9b84-c15a8e1b23bc',
    );
    expect(item?.changes[0]?.newValue).toBe('390266703839233');
  });

  it('records it on a field change too', async () => {
    await history().log({
      ...subject,
      action: 'update',
      field: 'status',
      oldValue: 'inStock',
      newValue: 'inUse',
      actorId: 'user-1',
      origin: 'import',
    });
    const [item] = (await history().timeline(subject)).data;
    expect(item?.changes[0]?.origin).toBe('import');
  });

  it('tells a scheduled write from a person editing the same field', async () => {
    await history().log({
      ...subject,
      action: 'update',
      field: 'expiryDate',
      oldValue: '2026-01-01',
      newValue: '2027-01-01',
      actorId: 'user-1',
      origin: 'schedule',
    });
    await history().log({
      ...subject,
      action: 'update',
      field: 'expiryDate',
      oldValue: '2027-01-01',
      newValue: '2028-01-01',
      actorId: 'user-1',
    });
    const origins = (await history().timeline(subject)).data.map(
      (item) => item.changes[0]?.origin,
    );
    expect(origins).toContain('schedule');
    expect(origins).toContain('human');
  });
});
