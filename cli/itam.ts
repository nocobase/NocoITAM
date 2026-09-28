import { defineCliPlugin, type AppCliPlugin } from '@nocobase/app-cli';

/**
 * Application change (ITAM): this application's own build step, declared the
 * way a plugin declares one because `nocobase build` offers no other
 * extension point (template beta.49 replaced the local `scripts/build.mjs`,
 * which used to copy the seed assets itself).
 *
 * It is not a package: `packageName` only names the entry in the CLI's
 * collision messages, and the topic it implies (`itam`) holds no commands.
 * The development-only `data:reset` is a script (`scripts/data-reset.ts`)
 * rather than a `devCommands` entry here, so nothing in this file reaches
 * for the server code.
 */
const itam: AppCliPlugin = defineCliPlugin({
  packageName: '@itam/itam',
  description: 'ITAM build steps.',
  buildHooks: {
    afterServerBuild: [
      {
        label: 'Copy seed assets',
        command: ['node', 'scripts/copy-seed-assets.mjs'],
      },
    ],
  },
});

export default itam;
