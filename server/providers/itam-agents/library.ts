import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import type { DatabaseManager } from '@nocobase/db';

import { assistantId } from './assistant.js';
import { claimMarker, readMarker, writeMarker } from './markers.js';
import { METHOD_SKILLS } from './skill.js';

/**
 * @temporary(nocobase-official): an application cannot ship skills into the
 * Agents plugin's library, so ITAM's method skills are put there from code
 * once, at start (after NocoCRM's). Replace with the plugin's own mechanism
 * when it has one.
 *
 * ITAM's method skills (ai/skills: onboarding, offboarding, receiving,
 * catalog, device-sync) as skills of the library, where people read and edit them under
 * AI → 技能: each is added once, from its SKILL.md as shipped, and attached
 * to Noco; the marker keeps their ids, so a skill an administrator edited,
 * detached or deleted stays as they left it, and a later SKILL.md shipped
 * with the code does not replace the library's. The background work reads
 * the library's current version (`readSkill` in ai-model.ts).
 */
export const SKILLS_MARKER = 'agents-skills-v1';

/**
 * ai/skills beside the server: the repository's in development, the copy
 * the build puts in `dist/ai/skills` in a deployment.
 */
export const SKILLS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'ai',
  'skills',
);

export async function provisionSkills(
  agents: Agents,
  database: DatabaseManager,
): Promise<void> {
  const marker = await readMarker(database, SKILLS_MARKER);
  if (
    !marker &&
    !(await claimMarker(database, SKILLS_MARKER, { skillIds: {} }))
  )
    return;
  const known = skillIdsOf(marker);
  const missing = METHOD_SKILLS.filter((slug) => !known[slug]);
  if (!missing.length) return;
  // One a person added under the same name before is taken as it is.
  const library = new Map(
    (await agents.skills.list()).map((skill) => [skill.slug, skill.id]),
  );
  const added: Record<string, string> = {};
  for (const slug of missing) {
    const existing = library.get(slug);
    if (existing) {
      added[slug] = existing;
      continue;
    }
    const content = await readFile(
      join(SKILLS_DIR, slug, 'SKILL.md'),
      'utf8',
    ).catch(() => null);
    if (!content) continue;
    added[slug] = (await agents.skills.create(null, { content })).id;
  }
  if (!Object.keys(added).length) return;
  const agentId = await assistantId(database);
  if (agentId) {
    const target = { scope: 'agent', scopeId: agentId } as const;
    const attached = await agents.skills.attached(target).catch(() => null);
    if (attached)
      await agents.skills.attach(target, [
        ...new Set([...attached, ...Object.values(added)]),
      ]);
  }
  await writeMarker(database, SKILLS_MARKER, {
    skillIds: { ...known, ...added },
  });
}

function skillIdsOf(
  marker: Record<string, unknown> | null,
): Record<string, string> {
  const ids = marker?.skillIds;
  return ids && typeof ids === 'object'
    ? Object.fromEntries(
        Object.entries(ids).filter(
          (entry): entry is [string, string] =>
            typeof entry[1] === 'string' && entry[1] !== '',
        ),
      )
    : {};
}
