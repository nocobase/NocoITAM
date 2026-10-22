import { defineCliPlugins, type AppCliPlugins } from '@nocobase/app-cli';
import scheduler from '@nocobase/app-plugin-scheduler/cli';
import agents from '@nocobase/app-plugin-agents/cli';
import foundation from '@nocobase/app-plugin-foundation/cli';

import itam from './itam.js';

// Array order is command registration order. A plugin contributes its commands
// by appearing in this list; removing its entry and its import removes them.
// `itam` is this application's own build hook (see `cli/itam.ts`).
const cliPlugins: AppCliPlugins = defineCliPlugins([
  scheduler,
  foundation,
  agents,
  itam,
]);

export default cliPlugins;
