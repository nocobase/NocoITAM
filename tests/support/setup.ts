import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Seeds write pictures to the file store (`APP_STORAGE_DIR`, else the
// application's storage/ directory). Every test worker gets its own temporary
// store so a test run never touches the developer's storage/objects.
process.env.APP_STORAGE_DIR ??= mkdtempSync(
  path.join(tmpdir(), 'itam-test-storage-'),
);
