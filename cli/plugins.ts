import { defineCliPlugins, type AppCliPlugins } from '@nocobase/app-cli';
import aiEmployee from '@nocobase/app-plugin-ai-employee/cli';
import scheduler from '@nocobase/app-plugin-scheduler/cli';
import workflow from '@nocobase/app-plugin-workflow/cli';

import itam from './itam.js';

// Array order is command registration order. A plugin contributes its commands
// by appearing in this list; removing its entry and its import removes them.
// `itam` is this application's own build hook (see `cli/itam.ts`).
const cliPlugins: AppCliPlugins = defineCliPlugins([
  workflow,
  scheduler,
  aiEmployee,
  itam,
]);

export default cliPlugins;
