import { fileURLToPath } from 'node:url';

import { createNodeVitestConfig } from '@nocobase/dev-config/vitest/node';
import { createReactVitestConfig } from '@nocobase/dev-config/vitest/react';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

// Application change (ITAM, 2026-10-25): NOCOBASE_TEST_DB_DIALECT=postgres or
// mysql runs the database tests on a server (tests/support/test-database.ts),
// which applies the application's two hundred migrations far slower than an
// in-memory SQLite, for each test that starts the application: longer than
// the preset's 30 seconds.
const dialect = process.env.NOCOBASE_TEST_DB_DIALECT?.trim();
const serverDatabase = !!dialect && dialect !== 'sqlite';
const timeouts = serverDatabase
  ? { testTimeout: 300_000, hookTimeout: 300_000 }
  : {};

// Application change (ITAM): the application's code imports through `@/`.
const resolve = {
  alias: [
    {
      find: '@',
      replacement: fileURLToPath(new URL('./client', import.meta.url)),
    },
  ],
};

// Keep the fixture, application and plugin clients in the same React/router context.
// Server and shared modules stay external to preserve their service identities.
const inline = [
  /@nocobase\/app-testing\/(?:dist\/)?src\/client\//u,
  /@nocobase\/app-client\//u,
  /@[^/]+\/app-plugin-[^/]+\/(?:dist\/)?client\//u,
];

// Application change (ITAM): every project also gives each worker a temporary
// file store (tests/support/setup.ts).
const itamSetup = 'tests/support/setup.ts';

export default defineConfig({
  test: {
    root,
    projects: [
      createNodeVitestConfig({
        resolve,
        test: {
          root,
          name: 'node',
          include: ['tests/{server,database,cli,project}/**/*.test.{ts,tsx}'],
          // Database fixtures and command output capture run one file at a time.
          fileParallelism: false,
          setupFiles: [itamSetup],
          ...timeouts,
        },
      }),
      createReactVitestConfig({
        resolve,
        test: {
          root,
          name: 'client',
          environment: './tests/setup/application-environment.ts',
          // Client integration tests also start isolated application databases.
          fileParallelism: false,
          include: ['tests/client/**/*.test.{ts,tsx}'],
          setupFiles: ['./tests/setup/client-config.ts', itamSetup],
          server: { deps: { inline } },
          ...timeouts,
        },
      }),
      // Application change (ITAM): this application's own tests, kept apart
      // from the template's directories so an upgrade can replace those. They
      // run in parallel in jsdom as they did before template beta.83; a file
      // that needs Node says so with `// @vitest-environment node`.
      createReactVitestConfig({
        resolve,
        test: {
          root,
          name: 'itam',
          include: ['tests/{logic,components}/**/*.test.{ts,tsx}'],
          setupFiles: ['./tests/setup/client-config.ts', itamSetup],
          server: { deps: { inline } },
          ...timeouts,
        },
      }),
    ],
    // Only the directories above contain Vitest suites. Playwright has its own runner.
    // Keep the command usable if an application intentionally removes all scaffold tests.
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'html'],
    },
  },
});
