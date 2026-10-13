import { createApplicationConfig } from '@nocobase/dev-config/eslint';

export default createApplicationConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: [
    '.extension-state/**',
    'client-old/**',
    // The NocoSolution clone is another repository's content: this one
    // neither lints nor reformats it.
    'nocosolution/**',
    'public/r/**',
    'storage/**',
  ],
});
