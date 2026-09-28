#!/usr/bin/env node
import type { AppCliCommands } from '@nocobase/nb3-cli/plugins';
import { runAppCli } from '@nocobase/nb3-cli/runtime';

import appCommands from './commands/index.js';
import cliPlugins from './plugins.js';

// Development adds the commands under `cli/dev-commands/`, which a server
// deployment must not carry — `pnpm build` emits the server half alone.
// Running from source is what distinguishes the two: a build emits `.js`.
//
// The specifier is assembled at run time so the compiler does not follow it. A
// literal would pull `dev-commands` into the server build no matter what
// `exclude` says, and that build cannot resolve what those commands import.
const runningFromSource = import.meta.filename.endsWith('.ts');
const devCommands: AppCliCommands = runningFromSource
  ? (
      (await import(`${'./dev-commands'}/index.js`)) as {
        default: AppCliCommands;
      }
    ).default
  : {};

await runAppCli({
  commands: { ...appCommands, ...devCommands },
  plugins: cliPlugins,
});
