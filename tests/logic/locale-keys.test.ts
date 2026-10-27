// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';

/**
 * Every static translation key the client uses must exist in the English
 * locale (the shape source); zh-CN is checked by the type system. Dynamic
 * keys built from template literals are out of scope here.
 */
function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
  return files;
}

function lookup(resource: unknown, key: string): unknown {
  if (!resource || typeof resource !== 'object') return undefined;
  const group = resource as Record<string, unknown>;
  // Some groups key their entries flat, by their whole dotted name: the
  // template's system copy at the root (`'auth.loading'`), the file
  // components inside `fileUi` (`'files.empty'`).
  if (key in group) return group[key];
  const parts = key.split('.');
  for (let index = 1; index < parts.length; index += 1) {
    const head = parts.slice(0, index).join('.');
    if (!(head in group)) continue;
    const value = lookup(group[head], parts.slice(index).join('.'));
    if (value !== undefined) return value;
  }
  return undefined;
}

function has(resource: Record<string, unknown>, key: string): boolean {
  if (lookup(resource, key) !== undefined) return true;
  return (
    lookup(resource, `${key}_one`) !== undefined ||
    lookup(resource, `${key}_other`) !== undefined
  );
}

describe('client locale keys', () => {
  const root = path.resolve(process.cwd(), 'client');
  const files = walk(root).filter(
    (file) =>
      !file.includes(`${path.sep}locales${path.sep}`) &&
      !file.includes(`${path.sep}extensions${path.sep}`) &&
      // The template's component reference pages carry their own locale
      // namespace under client/pages/reference/locales.
      !file.includes(`${path.sep}pages${path.sep}reference${path.sep}`) &&
      !file.includes(`${path.sep}components${path.sep}ui${path.sep}`),
  );
  const keys = new Set<string>();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bt\(\s*'([a-zA-Z0-9_.-]+)'/g)) {
      // A key ending in a dot is a prefix concatenated at run time.
      if (!match[1]!.endsWith('.')) keys.add(match[1]!);
    }
    // Keys carried as data (field labels, tab labels, enum options) and
    // translated later by the generic components.
    for (const match of source.matchAll(
      /'((?:tabs|fields|groups|references|navigation)\.[a-zA-Z0-9_.]+)'/g,
    )) {
      keys.add(match[1]!);
    }
  }

  it('finds keys to check', () => {
    expect(keys.size).toBeGreaterThan(50);
  });

  it('defines every static key in en-US', () => {
    const missing = [...keys].filter(
      (key) => !has(enUS as unknown as Record<string, unknown>, key),
    );
    expect(missing).toEqual([]);
  });

  it('translates every en-US leaf in zh-CN with non-empty text', () => {
    const leaves = (resource: Record<string, unknown>, prefix = ''): string[] =>
      Object.entries(resource).flatMap(([key, value]) =>
        value && typeof value === 'object'
          ? leaves(value as Record<string, unknown>, `${prefix}${key}.`)
          : [`${prefix}${key}`],
      );
    const empty = leaves(enUS as unknown as Record<string, unknown>).filter(
      (key) => {
        const value = lookup(zhCN as unknown as Record<string, unknown>, key);
        return typeof value !== 'string' || value.trim() === '';
      },
    );
    expect(empty).toEqual([]);
  });
});
