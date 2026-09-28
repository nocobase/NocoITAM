// Copies the data files seeds ship (the model pictures under
// `database/main/seeds/assets/`) next to the compiled seeds in `dist/`.
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
