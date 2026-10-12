// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

// Application change (ITAM): the template's migration on its own, as the
// template tests it. Among this application's migrations it runs after
// `202609230003_write_ai_collection_metadata`, whose documents describe the
// AI employee plugin's tables, which a database created without that plugin
// does not have until `202610120002_drop_orphaned_ai_metadata` removes them;
// the whole chain is `migrations.test.ts`'s. The directory holds a file that
// re-exports the application's own, so that is the migration loaded.
const NAME = '202610060001_create_device_code';
const directory = mkdtempSync(path.join(os.tmpdir(), 'itam-device-code-'));
writeFileSync(
  path.join(directory, `${NAME}.ts`),
  `export { default } from ${JSON.stringify(
    path.resolve(
      import.meta.dirname,
      `../../database/main/migrations/${NAME}.ts`,
    ),
  )};\n`,
);
const sources: readonly MigrationSource[] = [
  { packageName: 'device-code-test', directory },
];

// The table Better Auth's `deviceAuthorization()` reads and writes (`server/config/auth.ts`).
describeMigration('202610060001_create_device_code', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const deviceCode = await expectCollection('deviceCode').toExist();
    expect(Object.keys(deviceCode.fields)).toEqual([
      'id',
      'deviceCode',
      'userCode',
      'userId',
      'expiresAt',
      'status',
      'lastPolledAt',
      'pollingInterval',
      'clientId',
      'scope',
    ]);
    expect(deviceCode.primaryKey).toEqual(['id']);
    await expectCollection('deviceCode').toHaveField('userId', {
      nullable: true,
    });
    await expectCollection('deviceCode').toHaveField('expiresAt', {
      nullable: false,
    });
    const row = {
      deviceCode: 'device-1',
      userCode: 'WXYZ2345',
      expiresAt: new Date(),
      status: 'pending',
      pollingInterval: 5000,
      clientId: 'cli',
    };
    await connection.query
      .insertInto('deviceCode')
      .values({ ...row, id: 'a' })
      .execute();
    // Both codes are unique.
    await expect(
      connection.query
        .insertInto('deviceCode')
        .values({ ...row, id: 'b', userCode: 'OTHER234' })
        .execute(),
    ).rejects.toThrow();
    await expect(
      connection.query
        .insertInto('deviceCode')
        .values({ ...row, id: 'c', deviceCode: 'device-2' })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('deviceCode').not.toExist();
  },
});
