import type { AppCliCommands } from '@nocobase/nb3-cli/plugins';

import AppDataReset from './data-reset.js';

/**
 * Commands that only exist while the application runs from source.
 *
 * Data reset wipes and re-seeds the development database; a deployment must
 * never carry it, so it stays out of `cli/commands/` and the compiled CLI
 * never ships it. The client and server inspection commands that used to live
 * here went with template beta.43, which dropped its own `cli/dev-commands/`.
 */
const devCommands: AppCliCommands = {
  'data:reset': AppDataReset,
};

export default devCommands;
