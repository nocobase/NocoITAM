// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  nextVersion,
  setVersion,
} from '../../scripts/ci/release-version.mjs';

// The version a release takes (scripts/ci/release-version.mjs, run by
// .github/workflows/release.yml): the next one by default, or a later one
// named by hand, written into package.json without reformatting it.

describe('the release version', () => {
  it('increases the last number by default', () => {
    expect(nextVersion('1.0.0-beta.86')).toBe('1.0.0-beta.87');
    expect(nextVersion('1.0.0-beta.9')).toBe('1.0.0-beta.10');
    expect(nextVersion('1.2.3')).toBe('1.2.4');
    expect(nextVersion('1.0.0-beta.86', '  ')).toBe('1.0.0-beta.87');
  });

  it('asks for a version when the current one does not end in a number', () => {
    expect(() => nextVersion('1.0.0-beta')).toThrow('name the version');
  });

  it('takes a later version named by hand, with or without a v', () => {
    expect(nextVersion('1.0.0-beta.86', '1.0.0')).toBe('1.0.0');
    expect(nextVersion('1.0.0-beta.86', 'v1.0.0-rc.1')).toBe('1.0.0-rc.1');
    expect(nextVersion('1.0.0-beta.86', '1.0.0-beta.100')).toBe(
      '1.0.0-beta.100',
    );
  });

  it('refuses a named version that is not later, or not a version', () => {
    expect(() => nextVersion('1.0.0-beta.86', '1.0.0-beta.86')).toThrow(
      'not later',
    );
    expect(() => nextVersion('1.0.0-beta.86', '1.0.0-beta.9')).toThrow(
      'not later',
    );
    expect(() => nextVersion('1.0.0', '1.0.0-rc.1')).toThrow('not later');
    expect(() => nextVersion('1.0.0-beta.86', 'next')).toThrow(
      'Not a release version',
    );
  });

  it('orders versions as Semantic Versioning does', () => {
    const ordered = [
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
      '1.0.1',
      '1.10.0',
      '2.0.0',
    ];
    for (let i = 1; i < ordered.length; i++) {
      expect(compareVersions(ordered[i - 1], ordered[i])).toBeLessThan(0);
      expect(compareVersions(ordered[i], ordered[i - 1])).toBeGreaterThan(0);
    }
    expect(compareVersions('1.0.0-beta.1', '1.0.0-beta.1')).toBe(0);
  });

  it('changes only the version in package.json', () => {
    const text =
      '{\n  "name": "itam",\n  "version": "1.0.0-beta.86",\n  "dependencies": {\n    "x": "1.0.0"\n  }\n}\n';
    expect(setVersion(text, '1.0.0-beta.87')).toBe(
      text.replace('1.0.0-beta.86', '1.0.0-beta.87'),
    );
  });
});
