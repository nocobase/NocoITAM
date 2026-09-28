// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import {
  ServerFileRepositoryManager,
  serverFileRepositoryManagerToken,
} from '@nocobase/app-plugin-file/server';

import { attachmentLinkRoutes } from '../../server/routes/itam/attachments.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

let app: TestApp | undefined;
afterEach(async () => {
  await app?.destroy();
});

it.each(['/main', ''])(
  'returns a usable content URL for an existing Markdown attachment at base path %s',
  async (publicBasePath) => {
    app = await createTestApp();
    Object.assign(app.app, { publicBasePath });
    // URL generation uses repository metadata only; no storage reads are expected.
    const drive = {} as ConstructorParameters<
      typeof ServerFileRepositoryManager
    >[1];
    app.container.instance(
      serverFileRepositoryManagerToken,
      new ServerFileRepositoryManager(app.db.database, drive),
    );
    const id = '00000000-0000-4000-8000-000000000001';
    const query = app.db.database.query();
    await query
      .insertInto('itamFiles')
      .values({
        id,
        disk: 'local',
        key: 'objects/spec.md',
        filename: 'CRM-SPEC.md',
        ext: 'md',
        mimeType: 'text/markdown',
        size: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    await query
      .insertInto('attachmentLinks')
      .values({
        id: 'link',
        fileId: id,
        ownerType: 'devices',
        ownerId: 'ticket',
        uploadedById: 'mia',
        createdAt: new Date(),
      })
      .execute();
    await app.mount(attachmentLinkRoutes);
    expect(
      (await app.request('/api/itam/attachments/devices/ticket')).status,
    ).toBe(401);
    expect(
      (
        await app.request('/api/itam/attachments/purchaseOrders/order', {
          user: 'li',
          role: 'employee',
        })
      ).status,
    ).toBe(403);
    const response = await app.request('/api/itam/attachments/devices/ticket', {
      user: 'mia',
      role: 'manager',
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data[0].files[0]).toMatchObject({
      filename: 'CRM-SPEC.md',
      contentUrl: `${publicBasePath}/uploads/itam/${id}.md`,
    });
  },
);

it('writes attaching and removing a file to the timeline as events', async () => {
  app = await createTestApp();
  const id = '00000000-0000-4000-8000-000000000002';
  const query = app.db.database.query();
  await query
    .insertInto('itamFiles')
    .values({
      id,
      disk: 'local',
      key: 'objects/quote.pdf',
      filename: 'quote.pdf',
      ext: 'pdf',
      mimeType: 'application/pdf',
      size: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .execute();
  await app.mount(attachmentLinkRoutes);
  const linked = await app.request('/api/itam/attachments/devices/dev-1', {
    ...json({ fileIds: [id] }),
    user: 'mia',
    role: 'manager',
  });
  expect(linked.status).toBe(201);
  const linkId = (await linked.json()).data[0].linkId;
  expect(
    (
      await app.request(`/api/itam/attachments/links/${linkId}`, {
        method: 'DELETE',
        user: 'mia',
        role: 'manager',
      })
    ).status,
  ).toBe(200);

  // Attaching a file is something someone did, so it reads as an event; the
  // change log keeps field changes only.
  const changes = await query
    .selectFrom('changeLogs')
    .select(['action', 'field'])
    .where('subjectType', '=', 'devices')
    .where('subjectId', '=', 'dev-1')
    .execute();
  expect(changes).toEqual([]);
  const events = await query
    .selectFrom('historyEvents')
    .select(['type', 'summary'])
    .where('subjectType', '=', 'devices')
    .where('subjectId', '=', 'dev-1')
    .orderBy('createdAt', 'asc')
    .execute();
  expect(events).toEqual([
    { type: 'attachmentAdded', summary: 'Attached quote.pdf' },
    { type: 'attachmentRemoved', summary: 'Removed quote.pdf' },
  ]);
});
