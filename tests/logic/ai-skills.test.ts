// @vitest-environment node

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import itamEmployee, { ITAM_SKILLS } from '../../ai/employees/itam.js';

const skillsDir = path.resolve(process.cwd(), 'ai/skills');

/**
 * A skill is a delivered document, not prose inside the instructions: the
 * plugin loads `ai/skills/<name>/SKILL.md` by scanning that directory, and the
 * build copies it into `dist`. So the thing to hold still is that the files
 * and the names the employee enables are the same set — a skill the employee
 * does not name is never offered, and a name with no file is nothing at all.
 */
describe('the skills this Solution delivers', () => {
  const directories = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  it('are exactly the ones the employee enables', () => {
    expect([...directories].sort()).toEqual([...ITAM_SKILLS].sort());
    expect([...(itamEmployee.skills ?? [])].sort()).toEqual(
      [...ITAM_SKILLS].sort(),
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

  it('let the chat use skills at all', () => {
    expect(itamEmployee.chatSettings?.enableSkills).toBe(true);
  });
});
