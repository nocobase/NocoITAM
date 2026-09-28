import path from 'node:path';
import { runAppTool } from '@nocobase/app-tools';

// The tool asks the CLI for plugin hooks with `pnpm nocobase …` and parses its
// stdout as JSON. pnpm 11 prints the script banner first, which is not JSON,
// so the reporter is silenced for the child processes this script spawns.
process.env.npm_config_reporter ??= 'silent';

const [operation, ...args] = process.argv.slice(2);
if (operation !== 'retarget' && operation !== 'verify') {
  console.error(
    'Usage: node scripts/server-deps.mjs <retarget|verify> [options]',
  );
  process.exitCode = 2;
} else {
  process.exitCode = await runAppTool(operation, {
    rootDir: path.resolve(import.meta.dirname, '..'),
    args,
  });
}
