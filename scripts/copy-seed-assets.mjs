// Copies the data files seeds ship (the model pictures under
// `database/main/seeds/assets/`) next to the compiled seeds in `dist/`, and
// the assistant's skills (`ai/skills/`) to `dist/ai/skills/`.
//
// tsc emits only TypeScript, and a seed reads its files relative to itself,
// so without this a deployment's model seed finds no pictures. `nocobase
// build` runs it as the `afterServerBuild` hook declared in `cli/itam.ts`,
// before the database manifests are generated and before `--tar` packs.
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const source = path.join(rootDir, 'database', 'main', 'seeds', 'assets');
const target = path.join(
  rootDir,
  'dist',
  'database',
  'main',
  'seeds',
  'assets',
);

if (fs.existsSync(source)) {
  fs.cpSync(source, target, { recursive: true });
  console.log(`Copied seed assets into ${path.relative(rootDir, target)}`);
}

// The assistant's method skills (`ai/skills/<name>/SKILL.md`), which the
// server puts into the Agents plugin's skill library at its first start and
// reads relative to itself (server/providers/itam-agents/library.ts).
const skills = path.join(rootDir, 'ai', 'skills');
const skillsTarget = path.join(rootDir, 'dist', 'ai', 'skills');
if (fs.existsSync(skills)) {
  fs.cpSync(skills, skillsTarget, { recursive: true });
  console.log(`Copied AI skills into ${path.relative(rootDir, skillsTarget)}`);
}
