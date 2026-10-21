// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createAiLanguage } from '../../server/providers/itam/ai-language.js';
import {
  DEFAULT_ITAM_SETTINGS,
  type ItamSettings,
  type SettingsService,
} from '../../server/providers/itam/settings.js';

/** Settings with a stored 基本设置 and the save listeners the service hears. */
const settingsWith = (aiLanguage: string) => {
  const listeners: ((key: string, value: unknown) => void)[] = [];
  const service = {
    get: async () => ({ ...DEFAULT_ITAM_SETTINGS.general, aiLanguage }),
    onSaved: (listener: (key: string, value: unknown) => void) => {
      listeners.push(listener);
      return () => undefined;
    },
  } as unknown as SettingsService;
  const save = (general: Partial<ItamSettings['general']>) => {
    for (const listener of listeners)
      listener('general', { ...DEFAULT_ITAM_SETTINGS.general, ...general });
  };
  return { service, save };
};

// AI 工作语言 (2026-10-20): what the models write in, the deployment's
// locale unless 设置 → 通用 → 基本设置 names one.
describe('AI working language', () => {
  it('follows the deployment until a language is chosen, and keeps up with saves', async () => {
    const { service, save } = settingsWith('auto');
    const language = createAiLanguage({
      settings: service,
      deploymentLocale: () => 'zh-CN',
    });
    await language.load();
    expect(language.current()).toBe('zh-CN');
    save({ aiLanguage: 'en-US' });
    expect(language.current()).toBe('en-US');
    save({ aiLanguage: 'auto' });
    expect(language.current()).toBe('zh-CN');
  });

  it('reads the saved choice at start, and ignores one it does not know', async () => {
    const chosen = createAiLanguage({
      settings: settingsWith('en-US').service,
      deploymentLocale: () => 'zh-CN',
    });
    await chosen.load();
    expect(chosen.current()).toBe('en-US');
    const unknown = createAiLanguage({
      settings: settingsWith('fr-FR').service,
      deploymentLocale: () => 'zh-CN',
    });
    await unknown.load();
    expect(unknown.current()).toBe('zh-CN');
  });
});
