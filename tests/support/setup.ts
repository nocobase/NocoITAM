import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Seeds write pictures to the file store (`APP_STORAGE_DIR`, else the
// application's storage/ directory). Every test worker gets its own temporary
// store so a test run never touches the developer's storage/objects.
process.env.APP_STORAGE_DIR ??= mkdtempSync(
  path.join(tmpdir(), 'itam-test-storage-'),
);

// Application change (ITAM, 2026-11-06): Foundation >=0.1.0-beta.13 scans the
// application's TypeScript sources on the main thread whenever an application
// starts without a snapshot for the current kernel, which is every test
// application (a new database each time). In a source checkout that blocks the
// event loop for minutes and times out hooks. Tests do not use the automatic
// scan, so it is switched off here; deployments are unaffected. Set
// ITAM_TEST_FOUNDATION_SCAN=1 to keep it for a test that needs it.
import foundation from '@nocobase/app-plugin-foundation/server';
import { foundationServiceToken } from '@nocobase/app-plugin-foundation/server';
import { databaseManagerToken } from '@nocobase/db';

if (process.env.ITAM_TEST_FOUNDATION_SCAN !== '1') {
  for (const Provider of foundation.serviceProviders ?? []) {
    const start = Provider.prototype.start;
    if (
      typeof start !== 'function' ||
      (start as { itamTestScanOff?: boolean }).itamTestScanOff
    )
      continue;
    const withoutScan = async function (this: {
      app: {
        container: {
          has(token: unknown): boolean;
          resolve(token: unknown): { start?: unknown };
        };
      };
    }) {
      if (this.app.container.has(databaseManagerToken)) {
        this.app.container.resolve(foundationServiceToken).start =
          async () => {};
      }
      return start.call(this);
    };
    Object.assign(withoutScan, { itamTestScanOff: true });
    Provider.prototype.start = withoutScan;
  }
}
