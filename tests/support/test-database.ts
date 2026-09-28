import path from 'node:path';

import { sqliteDriver } from '@nocobase/db-sqlite';
import {
  createDatabaseManager,
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

/** An in-memory SQLite database with this application's migrations applied. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const database = createDatabaseManager({
    default: 'main',
    // Since template beta.43 sqlite is its own driver package, and a manager
    // built directly (rather than through the application, which loads the
    // official drivers) registers it explicitly.
    drivers: { sqlite: sqliteDriver },
    connections: {
      main: { dialect: 'sqlite', filename: ':memory:' },
    },
  });
  const migrator = createMigrator({
    database,
    packageName: 'itam',
    directory: migrationsDirectory,
  });
  await migrator.latest();
  return {
    database,
    migrator,
    destroy: () => database.destroy(),
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
