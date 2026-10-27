import { readFile } from 'node:fs/promises';

import { fileURLToPath } from 'node:url';
import { AppConfig } from '@nocobase/app-server/config';
import { describe, expect, it } from 'vitest';

// `pnpm nocobase config init` writes config.yml from this file: it replaces the instruction on the first line with
// its own header and fills the placeholder key of the live `secrets` section, keeping everything else verbatim. These
// are the parts of the example it relies on.
describe('config.example.yml', () => {
  const read = () =>
    readFile(new URL('../../config.example.yml', import.meta.url), 'utf8');

  it('opens with the instruction config init replaces', async () => {
    expect((await read()).split('\n')[0]).toMatch(
      /^# Copy this file to config\.yml\b/u,
    );
  });

  it('carries a live secrets section whose first key is a placeholder', async () => {
    expect(await read()).toContain(
      [
        'secrets:',
        '  keys:',
        '    - version: 1',
        '      key: replace-with-a-unique-secret',
      ].join('\n'),
    );
  });
  // Application change (ITAM): the Knowledge base is left out of this
  // application (its document extraction doubled the deployment archive), so
  // the example carries no knowledge section, live or commented, rather than
  // the template's opt-in one.
  it('configures no Knowledge base', async () => {
    const active = new AppConfig().loadFile(
      fileURLToPath(new URL('../../config.example.yml', import.meta.url)),
    );
    await active.loadAll();
    expect(active.get('knowledge')).toBeUndefined();
    expect(await read()).not.toMatch(/^#? ?knowledge:/m);
  });
});
