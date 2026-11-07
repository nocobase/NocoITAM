import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Chooses the version a release takes and writes it into package.json, from
// .github/workflows/release.yml. Without a requested version the last number
// of the current one goes up by one (1.0.0-beta.86 becomes 1.0.0-beta.87,
// 1.2.3 becomes 1.2.4); a requested version must be later than the current
// one. The chosen version goes to the step's output as `version`.

const VERSION =
  /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;

function parse(version) {
  const match = VERSION.exec(version);
  assert(match, `Not a release version: ${version}`);
  return {
    core: match.slice(1, 4).map(Number),
    pre: match[4] ? match[4].split('.') : [],
  };
}

// Semantic Versioning precedence: below zero when a comes first.
export function compareVersions(a, b) {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++)
    if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
  // A version without a pre-release comes after the same version with one.
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.min(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === q) continue;
    const pNumeric = /^\d+$/u.test(p);
    const qNumeric = /^\d+$/u.test(q);
    if (pNumeric && qNumeric) return Number(p) - Number(q);
    if (pNumeric !== qNumeric) return pNumeric ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return x.pre.length - y.pre.length;
}

export function nextVersion(current, requested = '') {
  parse(current);
  const wanted = requested.trim().replace(/^v/u, '');
  if (wanted) {
    parse(wanted);
    assert(
      compareVersions(wanted, current) > 0,
      `${wanted} is not later than the current version ${current}`,
    );
    return wanted;
  }
  const match = /^(.*?)(\d+)$/u.exec(current);
  assert(
    match,
    `${current} does not end in a number; name the version to release`,
  );
  return `${match[1]}${Number(match[2]) + 1}`;
}

// Replaces only the version, so the rest of package.json keeps its formatting.
export function setVersion(text, version) {
  const pattern = /^(\s*"version":\s*")[^"]*(")/mu;
  assert(pattern.test(text), 'package.json has no version');
  return text.replace(pattern, `$1${version}$2`);
}

function main() {
  try {
    const text = readFileSync('package.json', 'utf8');
    const version = nextVersion(
      JSON.parse(text).version,
      process.argv[2] ?? '',
    );
    writeFileSync('package.json', setVersion(text, version));
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
    console.log(version);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
