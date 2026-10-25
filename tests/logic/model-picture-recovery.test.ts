// @vitest-environment node
import { readFile } from 'node:fs/promises';

import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { databaseManagerToken } from '@nocobase/db';
import { expect } from 'vitest';

import { PICTURE_FILE_IDS } from '../../database/main/seeds/202609150001_seed_itam_manufacturers_models.js';
import { restoreModelPictures } from '../../server/providers/itam/model-pictures.js';
import { createStandaloneServer } from '../../server/standalone.js';

const missingId = PICTURE_FILE_IDS['macbook-pro-14-m3.jpg'];
const existingId = PICTURE_FILE_IDS['macbook-air-13-m3.jpg'];
const changedId = PICTURE_FILE_IDS['galaxy-s24.jpg'];
const deletedId = PICTURE_FILE_IDS['brio-301.jpg'];
const key = (id: string) => `objects/${id}.jpg`;
const replacement = Buffer.from('An existing file must not be overwritten');

const test = createAppTest({
  createServer: async (options) => {
    const first = await createStandaloneServer(options);
    try {
      const app = first.application;
      const disk = app.container.resolve(driveManagerToken).use('local');
      const query = app.container.resolve(databaseManagerToken).query();
      // Reproduce a deployed database whose seed is already recorded, but
      // whose image bytes are missing from its own volume.
      await disk.delete(key(missingId));
      await disk.put(key(existingId), replacement);
      await disk.delete(key(changedId));
      await query
        .updateTable('itamFiles')
        .set({ filename: 'administrator-picture.jpg' })
        .where('id', '=', changedId)
        .execute();
      await disk.delete(key(deletedId));
      await query.deleteFrom('itamFiles').where('id', '=', deletedId).execute();
      await query
        .updateTable('models')
        .set({ name: 'Administrator model name' })
        .where('id', '=', 'model-macbook-pro-14-m3')
        .execute();
    } finally {
      await first.close();
    }
    // Normal startup must repair the files even though no seed is pending.
    return createStandaloneServer(options);
  },
  connections: ['main'],
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
    secrets: { keys: [{ version: 1, key: 'a'.repeat(64) }] },
    notification: { channels: { 'in-app': { provider: 'in-app' } } },
    demoMode: { enabled: true },
  },
});

test('startup repairs and serves missing built-in pictures without resetting data or replacing files', async ({
  testApp,
  app,
  connection,
}) => {
  const disk = app.container.resolve(driveManagerToken).use('local');
  const original = await readFile(
    app.paths.database('main/seeds/assets/models/macbook-pro-14-m3.jpg'),
  );
  expect(Buffer.from(await disk.getBytes(key(missingId)))).toEqual(original);
  expect(Buffer.from(await disk.getBytes(key(existingId)))).toEqual(
    replacement,
  );
  expect(await disk.exists(key(changedId))).toBe(false);
  expect(await disk.exists(key(deletedId))).toBe(false);
  expect(
    await connection.query
      .selectFrom('itamFiles')
      .select('id')
      .where('id', '=', deletedId)
      .executeTakeFirst(),
  ).toBeUndefined();
  expect(
    await connection.query
      .selectFrom('models')
      .select('name')
      .where('id', '=', 'model-macbook-pro-14-m3')
      .executeTakeFirstOrThrow(),
  ).toEqual({ name: 'Administrator model name' });
  expect(await restoreModelPictures(app)).toBe(0);

  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const response = await admin.fetch(
    `http://localhost${testApp.publicBasePath}/uploads/itam/${missingId}.jpg`,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/jpeg');
  expect(Buffer.from(await response.arrayBuffer())).toEqual(original);
});
