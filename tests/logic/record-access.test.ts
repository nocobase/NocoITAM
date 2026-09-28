// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { auditsIRunScope } from '../../server/providers/itam/record-access.js';
import {
  createTestDatabase,
  type TestDatabase,
} from '../support/test-database.js';

/**
 * IT support reads and runs the audit tasks it is named on. The route tests'
 * authorization double grants by role and never evaluates a Record Access
 * policy, so the scope this one produces is checked here.
 */
describe('audits I run', () => {
  let harness: TestDatabase;

  const task = async (id: string, executorIds: readonly string[]) => {
    const now = new Date();
    await harness.database
      .query()
      .insertInto('auditTasks')
      .values({
        id,
        name: id,
        scope: {},
        executorIds,
        plannedStart: '2026-09-01',
        plannedEnd: '2026-09-30',
        status: 'draft',
        expectedCount: 0,
        countedCount: 0,
        differenceCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  };

  beforeEach(async () => {
    harness = await createTestDatabase();
  });

  afterEach(async () => {
    await harness.destroy();
  });

  it('matches only the tasks naming the reader', async () => {
    await task('mine', ['sam', 'mia']);
    await task('theirs', ['mia']);
    // One id collapses to the condition itself; two would be an `or` group.
    expect(await auditsIRunScope(harness.database, 'sam')).toMatchObject({
      kind: 'condition',
      operator: '$eq',
      value: 'mine',
    });
    await task('second', ['sam']);
    expect(
      JSON.stringify(await auditsIRunScope(harness.database, 'sam')),
    ).toContain('second');
    expect(
      JSON.stringify(await auditsIRunScope(harness.database, 'mia')),
    ).not.toContain('second');
  });

  it('matches no row rather than denying when the reader runs none', async () => {
    // `false` would refuse the action and the 盘点 page would read "Not
    // allowed" to someone simply not named on anything yet.
    await task('theirs', ['mia']);
    const scope = await auditsIRunScope(harness.database, 'sam');
    expect(scope).not.toBe(false);
    expect(scope).toMatchObject({
      kind: 'condition',
      operator: '$eq',
      value: '',
    });
  });

  it('reads an executor list that was stored as a JSON string', async () => {
    // Rows written before the query layer encoded JSON itself hold the text.
    await task('mine', ['sam']);
    await harness.database
      .query()
      .updateTable('auditTasks')
      .set({ executorIds: JSON.stringify(['sam']) as never })
      .where('id', '=', 'mine')
      .execute();
    const scope = await auditsIRunScope(harness.database, 'sam');
    expect(JSON.stringify(scope)).toContain('mine');
  });
});
