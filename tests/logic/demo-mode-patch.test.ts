import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, it } from 'vitest';

// The temporary Demo Mode patch (template 1.0.0-beta.92, 2026-11-10;
// .agents/rules/shell.md): fails once the plugin moves off the patched
// version, so the patch is checked against the new release and removed when
// the plugin fixes its route matching, and fails if the patch did not apply.
const PATCHED = '0.2.0-beta.9';
const require = createRequire(import.meta.url);
const manifest = require.resolve('@nocobase/app-plugin-demo-mode/package.json');

it('keeps Demo Mode on the version its patch was written for', () => {
  const installed = JSON.parse(readFileSync(manifest, 'utf8')) as {
    version: string;
  };
  expect(installed.version).toBe(PATCHED);
  const workspace = readFileSync(
    path.resolve(process.cwd(), 'pnpm-workspace.yaml'),
    'utf8',
  );
  expect(workspace).toContain(`'@nocobase/app-plugin-demo-mode@${PATCHED}':`);
});

it('nests the notice routes relative to their parents', () => {
  const notice = readFileSync(
    path.join(
      path.dirname(manifest),
      'dist/client/components/demo-mode-notice.js',
    ),
    'utf8',
  );
  expect(notice).toContain('Patched in NocoITAM');
  expect(notice).toContain('function entryRoutes(routes, parentPath');
});
