// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { commentRoutes } from '../../server/routes/itam/comments.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';
import { uuidOf } from '../support/ids.js';
import { attachmentServiceToken } from '../../server/providers/itam/attachments.js';

interface Line {
  readonly event: {
    readonly id: string;
    readonly type: string;
    readonly actorId: string | null;
    readonly payload: Record<string, unknown> | null;
  } | null;
  readonly replies?: readonly {
    readonly id: string;
    readonly actorId: string | null;
    readonly payload: Record<string, unknown> | null;
  }[];
}

// What people write on a record's history, after NocoCRM's 动态: whoever may
// read a record comments on it, replies join their comment, an @-mention and
// a reply tell the people concerned, and only a comment's author changes it.
describe('comments', () => {
  let app: TestApp;
  let vendorId: string;

  beforeEach(async () => {
    app = await createTestApp();
    await app.mount(masterDataRoutes);
    await app.mount(commentRoutes);
    // The accounts a mention names; the test database has no account table.
    const client = await app.db.database.connection().client<{
      schema: {
        createTable(
          name: string,
          build: (table: {
            string(name: string): { primary(): unknown };
          }) => void,
        ): Promise<unknown>;
      };
    }>();
    await client.schema.createTable('user', (table) => {
      table.string('id').primary();
      table.string('name');
      table.string('username');
    });
    await app.db.database
      .query()
      .insertInto('user')
      .values([
        { id: 'mia', name: 'Mia', username: 'mia' },
        { id: 'sam', name: 'Sam', username: 'sam' },
        { id: 'ann', name: 'Ann', username: 'ann' },
      ])
      .execute();
    const created = await app.request('/api/itam/master/vendors', {
      ...json({ name: 'Acme', types: ['equipment'] }),
      user: 'mia',
      role: 'manager',
    });
    vendorId = ((await created.json()) as { data: { id: string } }).data.id;
  });

  afterEach(async () => {
    await app.destroy();
  });

  const comment = (
    body: Record<string, unknown>,
    user = 'mia',
    role: 'manager' | 'support' | 'employee' = 'manager',
  ) =>
    app.request('/api/itam/comments', {
      ...json({ subjectType: 'vendors', subjectId: vendorId, ...body }),
      user,
      role,
    });

  const timeline = async (): Promise<Line[]> => {
    const response = await app.request(
      `/api/itam/master/vendors/${vendorId}/history`,
      { user: 'mia', role: 'manager' },
    );
    return ((await response.json()) as { data: Line[] }).data;
  };

  it('rejects anonymous requests', async () => {
    const response = await app.request('/api/itam/comments', {
      ...json({ subjectType: 'vendors', subjectId: vendorId, body: 'Hi' }),
    });
    expect(response.status).toBe(401);
  });

  it('rejects a caller who may not read the record', async () => {
    const response = await comment({ body: 'Hi' }, 'eve', 'employee');
    expect(response.status).toBe(403);
  });

  it('refuses a record that keeps no comments, and an empty one', async () => {
    const unknown = await app.request('/api/itam/comments', {
      ...json({ subjectType: 'approvals', subjectId: 'x', body: 'Hi' }),
      user: 'mia',
      role: 'manager',
    });
    expect(unknown.status).toBe(400);
    expect((await comment({ body: '   ' })).status).toBe(400);
  });

  it('puts a comment on the history and tells whoever it mentions', async () => {
    const response = await comment({
      body: 'Ask @Sam about the quote',
      mentions: ['sam', 'nobody', 'mia'],
    });
    expect(response.status).toBe(201);
    const lines = await timeline();
    const line = lines.find((entry) => entry.event?.type === 'comment');
    expect(line?.event?.payload).toMatchObject({
      body: 'Ask @Sam about the quote',
      // Only accounts that exist, never the writer.
      mentions: ['sam'],
    });
    expect(app.notifications.map((sent) => sent.to.id)).toEqual(['sam']);
    expect(app.notifications[0]?.content.body).toBe('Ask @Sam about the quote');
  });

  it('hangs replies under their comment and tells the thread', async () => {
    const first = await comment({ body: 'Is the quote in?' });
    const firstId = ((await first.json()) as { data: { id: string } }).data.id;
    const reply = await comment(
      { body: 'Yes, filed', replyToId: firstId },
      'sam',
      'support',
    );
    expect(reply.status).toBe(201);
    const replyId = ((await reply.json()) as { data: { id: string } }).data.id;
    // A reply to a reply joins the same thread.
    await comment({ body: 'Thanks', replyToId: replyId }, 'ann', 'manager');

    const lines = (await timeline()).filter(
      (entry) => entry.event?.type === 'comment',
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]?.replies?.map((entry) => entry.payload?.body)).toEqual([
      'Yes, filed',
      'Thanks',
    ]);
    // Mia hears of Sam's reply; Mia and Sam of Ann's.
    expect(app.notifications.map((sent) => sent.to.id).sort()).toEqual([
      'mia',
      'mia',
      'sam',
    ]);
  });

  it('lets only its author edit or delete a comment, and keeps the line', async () => {
    const created = await comment({ body: 'Draft wording' });
    const id = ((await created.json()) as { data: { id: string } }).data.id;

    const foreign = await app.request(`/api/itam/comments/${id}`, {
      ...json({ body: 'Changed' }),
      method: 'PATCH',
      user: 'sam',
      role: 'support',
    });
    expect(foreign.status).toBe(422);

    const edited = await app.request(`/api/itam/comments/${id}`, {
      ...json({ body: 'Final wording' }),
      method: 'PATCH',
      user: 'mia',
      role: 'manager',
    });
    expect(edited.status).toBe(200);
    let line = (await timeline()).find((entry) => entry.event?.id === id);
    expect(line?.event?.payload?.body).toBe('Final wording');
    expect(typeof line?.event?.payload?.editedAt).toBe('string');

    const removed = await app.request(`/api/itam/comments/${id}`, {
      method: 'DELETE',
      user: 'mia',
      role: 'manager',
    });
    expect(removed.status).toBe(200);
    line = (await timeline()).find((entry) => entry.event?.id === id);
    expect(line?.event?.payload?.body).toBe('');
    expect(typeof line?.event?.payload?.deletedAt).toBe('string');
  });

  it('attaches a file just uploaded and refuses one already on a record', async () => {
    const stamp = new Date().toISOString().slice(0, -1);
    const file = (id: string) => ({
      id: uuidOf(id),
      disk: 'local',
      key: id,
      filename: `${id}.pdf`,
      ext: 'pdf',
      mimeType: 'application/pdf',
      size: 10,
      createdAt: stamp,
      updatedAt: stamp,
    });
    await app.db.database
      .query()
      .insertInto('itamFiles')
      .values([file('fresh'), file('taken')])
      .execute();
    await app.db.database
      .query()
      .insertInto('attachmentLinks')
      .values({
        id: 'link',
        fileId: uuidOf('taken'),
        ownerType: 'vendors',
        ownerId: vendorId,
        createdAt: new Date(),
      })
      .execute();

    const attached = await comment({ body: '', fileIds: [uuidOf('fresh')] });
    expect(attached.status).toBe(201);
    const line = (await timeline()).find(
      (entry) => entry.event?.type === 'comment',
    );
    expect(line?.event?.payload?.files).toEqual([
      expect.objectContaining({
        id: uuidOf('fresh'),
        filename: 'fresh.pdf',
      }),
    ]);

    expect(
      (await comment({ body: 'x', fileIds: [uuidOf('taken')] })).status,
    ).toBe(400);
  });

  it('lets its author take one file off, and lists its files among the record’s attachments', async () => {
    const stamp = new Date().toISOString().slice(0, -1);
    await app.db.database
      .query()
      .insertInto('itamFiles')
      .values(
        ['one', 'two'].map((id) => ({
          id: uuidOf(id),
          disk: 'local',
          key: id,
          filename: `${id}.pdf`,
          ext: 'pdf',
          mimeType: 'application/pdf',
          size: 10,
          createdAt: stamp,
          updatedAt: stamp,
        })),
      )
      .execute();
    const created = await comment({
      body: 'Quotes',
      fileIds: [uuidOf('one'), uuidOf('two')],
    });
    const id = ((await created.json()) as { data: { id: string } }).data.id;

    // Somebody else may not; its author may, keeping the text.
    const edit = (user: string) =>
      app.request(`/api/itam/comments/${id}`, {
        ...json({ body: 'Quotes', mentions: [], keepFileIds: [uuidOf('two')] }),
        method: 'PATCH',
        user,
        role: 'manager',
      });
    expect((await edit('sam')).status).toBe(422);
    expect((await edit('mia')).status).toBe(200);
    const line = (await timeline()).find(
      (entry) => entry.event?.type === 'comment',
    );
    expect(line?.event?.payload).toMatchObject({
      body: 'Quotes',
      files: [expect.objectContaining({ id: uuidOf('two') })],
    });

    // Files uploaded while editing join the ones it keeps.
    await app.db.database
      .query()
      .insertInto('itamFiles')
      .values({
        id: uuidOf('three'),
        disk: 'local',
        key: 'three',
        filename: 'three.pdf',
        ext: 'pdf',
        mimeType: 'application/pdf',
        size: 10,
        createdAt: stamp,
        updatedAt: stamp,
      })
      .execute();
    const added = await app.request(`/api/itam/comments/${id}`, {
      ...json({
        body: 'Quotes',
        mentions: [],
        keepFileIds: [uuidOf('two')],
        fileIds: [uuidOf('three')],
      }),
      method: 'PATCH',
      user: 'mia',
      role: 'manager',
    });
    expect(added.status).toBe(200);
    expect(
      (
        (await timeline()).find((entry) => entry.event?.type === 'comment')
          ?.event?.payload?.files as { id: string }[]
      ).map((file) => file.id),
    ).toEqual([uuidOf('two'), uuidOf('three')]);
    await app.request(`/api/itam/comments/${id}`, {
      ...json({ body: 'Quotes', mentions: [], keepFileIds: [uuidOf('two')] }),
      method: 'PATCH',
      user: 'mia',
      role: 'manager',
    });

    // The attachments tab lists them in a group of their own.
    const groups = await app.container
      .resolve(attachmentServiceToken)
      .grouped('vendors', vendorId);
    expect(groups.at(-1)).toMatchObject({
      source: 'comments',
      files: [
        expect.objectContaining({
          id: uuidOf('two'),
          commentId: id,
          uploadedById: 'mia',
        }),
      ],
    });
  });
});
