import path from 'node:path';

import { createTestDatabase as openTestDatabase } from '@nocobase/app-testing/server';
import {
  createMigrator,
  type DatabaseManager,
  type Migrator,
} from '@nocobase/db';

// Resolved from the application root: the React vitest environment does not
// give modules a file:// URL to resolve against.
export const migrationsDirectory: string = path.resolve(
  process.cwd(),
  'database/main/migrations',
);

export interface TestDatabase {
  readonly database: DatabaseManager;
  readonly migrator: Migrator;
  destroy(): Promise<void>;
}

/**
 * An isolated database with this application's migrations applied: SQLite
 * unless `NOCOBASE_TEST_DB_DIALECT` names another (2026-10-25), postgres or
 * mysql on the server `POSTGRES_*` / `MYSQL_*` point at, so the tests show
 * the application runs there too. `destroy()` drops it again.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const test = await openTestDatabase();
  const migrator = createMigrator({
    database: test.database,
    packageName: 'itam',
    directory: migrationsDirectory,
  });
  await migrator.latest();
  return {
    database: test.database,
    migrator,
    destroy: () => test.destroy(),
  };
}

interface SchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
  };
}

export async function schemaClient(
  database: DatabaseManager,
): Promise<SchemaClient> {
  return database.connection().client<SchemaClient>();
}

/**
 * A test's own time limit, five times as long on a database server
 * (2026-10-25): the demo's tests import it whole, which takes minutes there
 * rather than seconds.
 */
export function timeLimit(ms: number): number {
  const dialect = process.env.NOCOBASE_TEST_DB_DIALECT?.trim();
  return dialect && dialect !== 'sqlite' ? ms * 5 : ms;
}
