import path from 'node:path';
import { runAppTool } from '@nocobase/app-tools';

// The tool asks the CLI for plugin hooks with `pnpm nocobase …` and parses its
// stdout as JSON. pnpm 11 prints the script banner first, which is not JSON,
// so the reporter is silenced for the child processes this script spawns.
process.env.npm_config_reporter ??= 'silent';
process.exitCode = await runAppTool('start', {
  rootDir: path.resolve(import.meta.dirname, '..'),
});
