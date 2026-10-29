import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import type { DatabaseManager } from '@nocobase/db';

import { claimMarker, readMarker, writeMarker } from './markers.js';
import { SHIPPED_SKILL_HASHES } from './shipped-skills.js';
import { METHOD_SKILLS, WORK_SKILLS } from './skill.js';

/**
 * @temporary(nocobase-official): an application cannot ship skills into the
 * Agents plugin's library, so ITAM's method skills are put there from code
 * once, at start (after NocoCRM's). Replace with the plugin's own mechanism
 * when it has one.
 *
 * ITAM's method skills (ai/skills: onboarding, offboarding, receiving,
 * catalog, device-sync) as skills of the library, where people read and edit them under
 * AI → 技能: each is added once, from its SKILL.md as shipped, and attached
 * to Asset Steward — a work agent's skill (approval-review) to its agent instead
 * (work-agents.ts); the marker keeps their ids, so a skill an administrator edited,
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
  const recorded = skillIdsOf(marker);
  await refreshShippedSkills(agents, recorded);
  const retired = await retireShippedSkills(agents, recorded);
  const known = Object.fromEntries(
    Object.entries(recorded).filter(([slug]) => !retired.includes(slug)),
  );
  if (retired.length)
    await writeMarker(database, SKILLS_MARKER, { skillIds: known });
  const missing = [...METHOD_SKILLS, ...WORK_SKILLS].filter(
    (slug) => !known[slug],
  );
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
  await writeMarker(database, SKILLS_MARKER, {
    skillIds: { ...known, ...added },
  });
}

export function skillIdsOf(
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

/**
 * Brings a library skill nobody has edited up to the SKILL.md shipped now
 * (2026-10-29, when the skills were rewritten in English): one whose current
 * version is still word for word a version ITAM shipped
 * (`SHIPPED_SKILL_HASHES`) is saved again as the current file, as a new
 * version; one an administrator changed is left as they left it. A skill
 * that fails to save is skipped, never stopping the start.
 */
export async function refreshShippedSkills(
  agents: Agents,
  known: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [slug, id] of Object.entries(known)) {
    const shipped = SHIPPED_SKILL_HASHES[slug];
    if (!shipped) continue;
    try {
      const content = await readFile(
        join(SKILLS_DIR, slug, 'SKILL.md'),
        'utf8',
      ).catch(() => null);
      if (!content) continue;
      const current = await agents.skills.get(id);
      if (current.content === content || current.files.length > 0) continue;
      const hash = createHash('sha256').update(current.content).digest('hex');
      if (!shipped.includes(hash)) continue;
      await agents.skills.save(id, null, {
        content,
        files: [],
        note: 'Updated to the version ITAM ships',
        expectedRevision: current.version,
      });
    } catch {
      // Deleted, or saved by someone meanwhile: left as it is.
    }
  }
}

/**
 * Skills ITAM once shipped and no longer uses (2026-10-29): the renewal
 * review agent's, replaced by renewal rules (627db8a).
 */
export const RETIRED_SKILLS: readonly string[] = ['renewal-review'];

/**
 * Takes a retired skill out of the library when nobody has edited it — its
 * current version is still one ITAM shipped — and returns the slugs it took
 * out; one an administrator changed stays theirs.
 */
export async function retireShippedSkills(
  agents: Agents,
  known: Readonly<Record<string, string>>,
): Promise<string[]> {
  const removed: string[] = [];
  for (const slug of RETIRED_SKILLS) {
    const id = known[slug];
    const shipped = SHIPPED_SKILL_HASHES[slug];
    if (!id || !shipped) continue;
    try {
      const current = await agents.skills.get(id);
      const hash = createHash('sha256').update(current.content).digest('hex');
      if (!shipped.includes(hash) || current.files.length > 0) continue;
      await agents.skills.remove(id);
      removed.push(slug);
    } catch {
      // Already gone, or the library cannot be reached: tried next start.
    }
  }
  return removed;
}
