import fs from 'node:fs';
import path from 'node:path';
import { runAppTool } from '@nocobase/app-tools';

const rootDir = path.resolve(import.meta.dirname, '..');

// The build asks the CLI for plugin hooks with `pnpm nocobase …` and parses
// its stdout as JSON. pnpm 11 prints the script banner first, which is not
// JSON, so the reporter is silenced for the child processes this build spawns.
process.env.npm_config_reporter ??= 'silent';
process.exitCode = await runAppTool('build', { rootDir });

// tsc emits only TypeScript. Seeds that ship data files (the model pictures
// under database/main/seeds/assets/) need them next to the compiled seed, so
// they are copied after the shared build finishes.
if (!process.exitCode) {
  const seedAssetsDir = path.join(
    rootDir,
    'database',
    'main',
    'seeds',
    'assets',
  );
  if (fs.existsSync(seedAssetsDir)) {
    fs.cpSync(
      seedAssetsDir,
      path.join(rootDir, 'dist', 'database', 'main', 'seeds', 'assets'),
      { recursive: true },
    );
    console.log('Copied seed assets');
  }
}
