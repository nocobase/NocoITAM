import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createSeeder, type DatabaseTaskConfig } from '@nocobase/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  createTestDatabase,
  type TestDatabase,
} from '../support/test-database.js';

/**
 * The seeds read the language they write master data in from the application's
 * own runtime configuration (`context.config`), the same reader the server
 * resolves `i18n.defaultLocale` through.
 *
 * They used to look for `config.yml` themselves, relative to `process.cwd()`.
 * That matched the deployment only when the working directory happened to be
 * the deployment root — `pnpm dev` always did, a Hub deployment never did — so
 * a deployment configured for `zh-CN` wrote every name in English while
 * development looked correct. Nothing reported it, because a missing config
 * fell back to `en-US`, which is a valid locale rather than an error.
 *
 * So each case here moves the working directory away first: nothing about the
 * answer may depend on where the process was started.
 */
const seedsDirectory = path.resolve(process.cwd(), 'database/main/seeds');
const originalCwd = process.cwd();

const runSeeds = async (config?: DatabaseTaskConfig) => {
  const db = await createTestDatabase();
  process.chdir(mkdtempSync(path.join(tmpdir(), 'itam-elsewhere-')));
  await createSeeder({
    database: db.database,
    packageName: 'itam',
    directory: seedsDirectory,
    ...(config ? { config } : {}),
  }).run();
  return db;
};

const namesOf = (db: TestDatabase) =>
  db.database
    .query()
    .selectFrom('categories')
    .select(['id', 'name'])
    .where('id', 'in', ['cat-endpoint', 'cat-laptop'])
    .execute<{ id: string; name: string }>()
    .then((rows) => new Map(rows.map((row) => [row.id, row.name])));

describe('the language the seeds write master data in', () => {
  let db: TestDatabase | undefined;
  const environmentLocale = process.env.APP_DEFAULT_LOCALE;
  beforeAll(() => {
    delete process.env.APP_DEFAULT_LOCALE;
  });
  afterEach(async () => {
    process.chdir(originalCwd);
    await db?.destroy();
    db = undefined;
  });
  afterAll(() => {
    if (environmentLocale === undefined) delete process.env.APP_DEFAULT_LOCALE;
    else process.env.APP_DEFAULT_LOCALE = environmentLocale;
  });

  it('comes from the configuration, by the dotted key', async () => {
    db = await runSeeds({
      get: <T>(key: string) =>
        (key === 'i18n.defaultLocale' ? 'zh-CN' : undefined) as T | undefined,
    });
    const names = await namesOf(db);
    expect(names.get('cat-endpoint')).toBe('终端设备');
    expect(names.get('cat-laptop')).toBe('笔记本电脑');
  });

  it('comes from the configuration, by the section', async () => {
    db = await runSeeds({
      get: <T>(key: string) =>
        (key === 'i18n' ? { defaultLocale: 'zh-CN' } : undefined) as
          T | undefined,
    });
    expect((await namesOf(db)).get('cat-endpoint')).toBe('终端设备');
  });

  it('falls back to APP_DEFAULT_LOCALE when a runner has no configuration', async () => {
    process.env.APP_DEFAULT_LOCALE = 'zh-CN';
    try {
      db = await runSeeds();
      expect((await namesOf(db)).get('cat-endpoint')).toBe('终端设备');
    } finally {
      delete process.env.APP_DEFAULT_LOCALE;
    }
  });

  it('falls back to English when neither says', async () => {
    db = await runSeeds();
    expect((await namesOf(db)).get('cat-endpoint')).toBe('End-user devices');
  });
});
