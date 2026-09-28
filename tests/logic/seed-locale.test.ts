import path from 'node:path';

import { createSeeder } from '@nocobase/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createTestDatabase,
  type TestDatabase,
} from '../support/test-database.js';

/**
 * The category seed writes names and field labels in the deployment's
 * default locale. The locale is read when the seed module loads, so it is
 * set before the seeder imports it; vitest gives each test file its own
 * module registry.
 */
describe('category seed locale', () => {
  let db: TestDatabase;
  beforeAll(async () => {
    process.env.APP_DEFAULT_LOCALE = 'zh-CN';
    db = await createTestDatabase();
    await createSeeder({
      database: db.database,
      packageName: 'itam',
      directory: path.resolve(process.cwd(), 'database/main/seeds'),
    }).run();
  });
  afterAll(async () => {
    delete process.env.APP_DEFAULT_LOCALE;
    await db.destroy();
  });

  it('writes the standard tree in the default locale', async () => {
    const rows = await db.database
      .query()
      .selectFrom('categories')
      .select(['id', 'name', 'fieldTemplate'])
      .where('id', 'in', ['cat-laptop', 'cat-sw-design', 'cat-endpoint'])
      .execute<{ id: string; name: string; fieldTemplate: unknown }>();
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get('cat-endpoint')?.name).toBe('终端设备');
    expect(byId.get('cat-laptop')?.name).toBe('笔记本电脑');
    expect(byId.get('cat-sw-design')?.name).toBe('设计');
    const template = JSON.stringify(byId.get('cat-laptop')?.fieldTemplate);
    expect(template).toContain('操作系统');
    expect(template).not.toContain('Operating system');
  });
});
