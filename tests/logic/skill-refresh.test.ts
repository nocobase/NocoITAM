import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, it, vi } from 'vitest';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

// A skill as once shipped, and one an administrator edited (2026-10-29).
vi.mock('../../server/providers/itam-agents/shipped-skills.js', () => ({
  SHIPPED_SKILL_HASHES: {
    receiving: [createHash('sha256').update('as shipped before').digest('hex')],
    catalog: [createHash('sha256').update('as shipped before').digest('hex')],
    'renewal-review': [
      createHash('sha256').update('as shipped before').digest('hex'),
    ],
  },
}));

const { refreshShippedSkills, retireShippedSkills, SKILLS_DIR } =
  await import('../../server/providers/itam-agents/library.js');

it('brings an unedited library skill up to the shipped file, and leaves an edited one', async () => {
  const stored: Record<string, string> = {
    'id-receiving': 'as shipped before',
    'id-catalog': 'as shipped before, then edited by an administrator',
  };
  const save = vi.fn(async () => ({}));
  const agents = {
    skills: {
      get: async (id: string) => ({
        content: stored[id],
        files: [],
        version: 3,
      }),
      save,
    },
  };
  await refreshShippedSkills(agents as never, {
    receiving: 'id-receiving',
    catalog: 'id-catalog',
  });
  const shipped = await readFile(
    join(SKILLS_DIR, 'receiving', 'SKILL.md'),
    'utf8',
  );
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith(
    'id-receiving',
    null,
    expect.objectContaining({ content: shipped, expectedRevision: 3 }),
  );
  expect(sha(stored['id-catalog']!)).not.toBe(sha('as shipped before'));
});

it('takes a retired skill nobody edited out of the library, and keeps an edited one', async () => {
  const remove = vi.fn(async () => undefined);
  const library = (content: string) => ({
    skills: {
      get: async () => ({ content, files: [], version: 1 }),
      remove,
    },
  });
  expect(
    await retireShippedSkills(library('as shipped before') as never, {
      'renewal-review': 'id-renewal',
    }),
  ).toEqual(['renewal-review']);
  expect(remove).toHaveBeenCalledWith('id-renewal');
  remove.mockClear();
  expect(
    await retireShippedSkills(
      library('rewritten by an administrator') as never,
      {
        'renewal-review': 'id-renewal',
      },
    ),
  ).toEqual([]);
  expect(remove).not.toHaveBeenCalled();
});
