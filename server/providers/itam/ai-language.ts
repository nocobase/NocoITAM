import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { SettingsService } from './settings.js';

/** What 设置 → 通用 → 基本设置 may name; `auto` follows the deployment's locale. */
export const AI_LANGUAGES = ['auto', 'zh-CN', 'en-US'] as const;
export type AiLanguage = (typeof AI_LANGUAGES)[number];

/**
 * The language everything the models write is in (2026-10-20): the form
 * readings (repair and disposal diagnosis, AI 整理), the approval review and
 * MDM 跟进. The administrator's choice under 设置 → 通用 → 基本设置, else the
 * deployment's locale (`APP_DEFAULT_LOCALE`, then `i18n.defaultLocale`) —
 * never the reader's interface, so two people asking about one request
 * read the same language. Answered at once from what was read at start and
 * kept current as the setting is saved, since the agents ask it in the
 * middle of their own work.
 */
export interface AiLanguageService {
  /** The locale to write in, e.g. `zh-CN`. */
  current(): string;
  /** Reads the setting once; until then the deployment's locale answers. */
  load(): Promise<void>;
}

export const aiLanguageToken: ServiceToken<AiLanguageService> =
  createServiceToken<AiLanguageService>('itam/ai-language');

const chosen = (value: unknown): string | undefined =>
  typeof value === 'string' &&
  value !== 'auto' &&
  (AI_LANGUAGES as readonly string[]).includes(value)
    ? value
    : undefined;

export function createAiLanguage(dependencies: {
  readonly settings: SettingsService;
  readonly deploymentLocale: () => string;
}): AiLanguageService {
  const { settings, deploymentLocale } = dependencies;
  let setting: string | undefined;
  settings.onSaved((key, value) => {
    if (key === 'general')
      setting = chosen((value as { aiLanguage?: unknown }).aiLanguage);
  });
  return {
    current: () => setting ?? deploymentLocale(),
    async load() {
      setting = chosen((await settings.get('general')).aiLanguage);
    },
  };
}
