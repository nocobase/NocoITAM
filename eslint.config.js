import { createApplicationConfig } from '@nocobase/dev-config/eslint';

export default createApplicationConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: [
    '.extension-state/**',
    // The AI chat UI is the plugin's Registry item materialized verbatim
    // (upgraded by three-way merge, never rewritten), so it keeps its
    // upstream style rather than this application's lint rules.
    'client/extensions/nocobase-ai/**',
    'client-old/**',
    // The NocoSolution clone is another repository's content: this one
    // neither lints nor reformats it.
    'nocosolution/**',
    'public/r/**',
    'storage/**',
  ],
  overrides: [
    {
      // Top-level workflow definitions and handlers use the server project.
      files: ['workflows/**/*.ts'],
      ignores: ['workflows/*/client/**'],
      languageOptions: {
        parserOptions: {
          projectService: false,
          project: './tsconfig.server.json',
        },
      },
    },
  ],
});
