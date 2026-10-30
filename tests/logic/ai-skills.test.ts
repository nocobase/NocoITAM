// @vitest-environment node

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { parseSkillMarkdown } from '@nocobase/app-plugin-agents/shared/skills';
import { describe, expect, it } from 'vitest';

import {
  METHOD_SKILLS,
  READING_SKILLS,
  WORK_SKILLS,
} from '../../server/providers/itam-agents/skill.js';

const skillsDir = path.resolve(process.cwd(), 'ai/skills');

/**
 * A skill is a delivered document, not prose inside the instructions: the
 * server puts `ai/skills/<name>/SKILL.md` into the Agents plugin's skill
 * library at its first start and attaches it to Asset Steward
 * (`server/providers/itam-agents/library.ts`), and the build copies the
 * directory into `dist`. So the thing to hold still is that the files and
 * the names the library is given are the same set — a file nobody names is
 * never offered, and a name with no file is nothing at all.
 */
describe('the skills this Solution delivers', () => {
  const directories = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  it('are exactly the ones put into the library', () => {
    // Asset Steward's method skills and the work agents' (2026-10-16).
    expect([...directories].sort()).toEqual(
      [...METHOD_SKILLS, ...WORK_SKILLS, ...READING_SKILLS].sort(),
    );
  });

  it('each carry a SKILL.md whose name matches its directory', () => {
    const read = (name: string) =>
      readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf8');
    // `description` is what the model reads to decide whether the skill
    // applies, so an empty one makes the skill unreachable in practice.
    const wellFormed = directories.filter(
      (name) =>
        read(name).startsWith('---\n') &&
        read(name).includes(`name: ${name}`) &&
        /^description: \S.*$/m.test(read(name)),
    );
    expect(wellFormed).toEqual(directories);
  });

  it('each pass the library’s own check', () => {
    // The library refuses a SKILL.md its parser rejects, and the start that
    // puts it there swallows the refusal (2026-10-29: "MDM: Intune" in a
    // description read as YAML and the skill stayed in Chinese).
    const problems = Object.fromEntries(
      directories.map((name) => [
        name,
        parseSkillMarkdown(
          readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf8'),
        ).problems,
      ]),
    );
    expect(problems).toEqual(
      Object.fromEntries(directories.map((name) => [name, []])),
    );
  });
});
