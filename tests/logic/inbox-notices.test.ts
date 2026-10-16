// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { noticeRoutes } from '../../server/routes/itam/notices.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

interface TableBuilder {
  string(name: string): { primary(): unknown };
  text(name: string): unknown;
}

// The inbox asks which record each of the reader's in-app notifications
// opens, to show it beside the list at the comment it is about. Only the
// reader's own items are answered.
describe('inbox notices', () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await createTestApp();
    await app.mount(noticeRoutes);
    // The in-app plugin's table, as far as the notices read it.
    const client = await app.db.database.connection().client<{
      schema: {
        createTable(
          name: string,
          build: (table: TableBuilder) => void,
        ): Promise<unknown>;
      };
    }>();
    await client.schema.createTable('notification_in_app_items', (table) => {
      table.string('id').primary();
      table.string('notification_id');
      table.string('user_id');
      table.text('target');
    });
    const route = (path: string) => JSON.stringify({ type: 'route', path });
    await app.db.database
      .query()
      .insertInto('notificationInAppItems')
      .values([
        {
          id: 'i1',
          notificationId: 'n1',
          userId: 'mia',
          target: route('/audits/a1/history?focus=c1'),
        },
        {
          id: 'i2',
          notificationId: 'n2',
          userId: 'mia',
          target: route('/procurement/p1'),
        },
        {
          id: 'i3',
          notificationId: 'n3',
          userId: 'sam',
          target: route('/devices/d1'),
        },
        { id: 'i4', notificationId: 'n4', userId: 'mia', target: null },
      ])
      .execute();
  });

  afterEach(async () => {
    await app.destroy();
  });

  const notices = async (ids: string, user?: string) =>
    app.request(`/api/itam/notices?ids=${ids}`, user ? { user } : {});

  it('names the record each of the reader’s notifications opens, and the comment', async () => {
    const response = await notices('n1,n2,n3,n4', 'mia');
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: {
        notificationId: string;
        subject: { type: string; id: string };
        data: { path: string; focus: string | null };
      }[];
    };
    expect(
      data
        .map((notice) => ({
          id: notice.notificationId,
          subject: notice.subject,
          data: notice.data,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual([
      {
        id: 'n1',
        subject: { type: 'audits', id: 'a1', label: null },
        data: { path: '/audits/a1/history?focus=c1', focus: 'c1' },
      },
      {
        id: 'n2',
        subject: { type: 'procurement', id: 'p1', label: null },
        data: { path: '/procurement/p1', focus: null },
      },
    ]);
  });

  it('says nothing about another reader’s notifications', async () => {
    const { data } = (await (await notices('n1,n3', 'sam')).json()) as {
      data: { notificationId: string }[];
    };
    expect(data.map((notice) => notice.notificationId)).toEqual(['n3']);
  });

  it('refuses a caller who is not signed in', async () => {
    expect((await notices('n1')).status).toBe(401);
  });
});
