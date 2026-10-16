// @vitest-environment node

import type { AuthorizationTitle } from '@nocobase/authorization/core';
import { APP_NS } from '@nocobase/i18n';
import { describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.ts';
import zhCN from '../../client/locales/zh-CN.ts';
import {
  collectionTitleOf,
  ITAM_RESOURCES,
  ITAM_SETTINGS_TITLE,
  settingsActionTitleOf,
} from '../../server/providers/itam/authz-resources.js';
import { ITAM_COLLECTIONS } from '../../server/providers/itam/collections.js';

/** What `t()` finds at a dot-separated key, or undefined. */
function lookup(resource: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, segment) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[segment]
          : undefined,
      resource,
    );
}

/**
 * Why a title would show untranslated, or undefined when it translates: it
 * must be a key in this application's namespace with a non-empty translation,
 * other than the raw name, in both languages. A plain string or a missing title
 * shows as written — `markLeft`, `PEOPLE` — in Chinese too.
 */
function untranslated(
  title: AuthorizationTitle | undefined,
  raw: string,
): string | undefined {
  if (typeof title !== 'object' || title.ns !== APP_NS)
    return `${raw}: ${JSON.stringify(title)}`;
  for (const locale of [enUS, zhCN]) {
    const text = lookup(locale, title.key);
    if (typeof text !== 'string' || !text || text === raw)
      return `${raw}: ${title.key}`;
  }
  return undefined;
}

describe('the authorization catalog’s titles', () => {
  const resources = ITAM_RESOURCES.map((resource) => resource.build());

  it('titles every ITAM operation and its heading', () => {
    expect(resources.length).toBeGreaterThan(0);
    expect(resources.every(({ actions }) => actions.length > 0)).toBe(true);
    const missing = resources.flatMap((resource) => [
      untranslated(resource.title, resource.name),
      ...resource.actions.flatMap((action) => [
        untranslated(action.title, action.name),
        ...(action.dataScopes ?? []).map((scope) =>
          untranslated(scope.title, scope.key),
        ),
      ]),
    ]);
    expect(missing.filter(Boolean)).toEqual([]);
  });

  it('words an operation as its page does', () => {
    const devices = resources.find(({ name }) => name === 'itam.devices');
    const title = (name: string) =>
      lookup(
        zhCN,
        (
          devices?.actions.find((action) => action.name === name)?.title as {
            key: string;
          }
        ).key,
      );
    expect(title('assign')).toBe('分配');
    expect(title('return')).toBe('归还');
    expect(title('transfer')).toBe('调拨');
    expect(title('loan')).toBe('借出');
    expect(title('export')).toBe('导出');
    expect(lookup(zhCN, (devices?.title as { key: string }).key)).toBe('设备');
  });

  it('titles every Collection and the settings item', () => {
    const missing = [
      ...ITAM_COLLECTIONS.map((collection) =>
        untranslated(collectionTitleOf(collection.name), collection.name),
      ),
      untranslated(ITAM_SETTINGS_TITLE, 'settings'),
      untranslated(settingsActionTitleOf('read'), 'read'),
      untranslated(settingsActionTitleOf('update'), 'update'),
    ];
    expect(missing.filter(Boolean)).toEqual([]);
  });
});
