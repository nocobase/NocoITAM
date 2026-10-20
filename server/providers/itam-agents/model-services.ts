import type { Application } from '@nocobase/app-server/application';
import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import { loggingToken } from '@nocobase/app-server/logging';

import type { ItamModelService } from '../../config/ai.js';

/**
 * The model services online agents call, created from the AI section of the
 * configuration (`ai.llmServices`), so a deployment configured for the
 * assistant gets them without anyone typing a key into the model services
 * page (after NocoCRM's).
 *
 * @temporary(nocobase-official) The Agents plugin reads model services only
 * from its page and API. Remove this once it can be configured from the
 * application's configuration. A configured service with a key appears on
 * the page under the same name; one that exists is never changed (an
 * administrator's edits stand); without `secrets.keys` it is skipped with a
 * warning rather than failing the start.
 */

// The provider names config.yml uses (the AI Employee plugin's, which ITAM
// once ran on), as the Agents plugin's.
const PROVIDERS: Record<string, string> = {
  dashscope: 'alibaba',
  openai: 'openai',
  deepseek: 'deepseek',
  anthropic: 'anthropic',
  google: 'google',
  'google-genai': 'google',
  kimi: 'moonshotai',
  moonshot: 'moonshotai',
  ollama: 'ollama',
};
// The Agents plugin's Alibaba provider calls the international endpoint;
// DashScope keys are usually the China region's.
const DASHSCOPE_CHINA = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

export async function provisionModelServices(
  app: Application,
  agents: Agents,
): Promise<void> {
  const configured =
    app.config?.get<Record<string, ItamModelService>>('ai.llmServices') ?? {};
  let existing: Set<string>;
  try {
    existing = new Set(
      (await agents.models.services.list()).map((service) => service.name),
    );
  } catch {
    return;
  }
  // In the order config.yml sorts them, which is the order the plugin lists
  // them in and so Asset Steward's models' (assistant.ts): its default is the first.
  const ordered = Object.entries(configured).sort(
    ([, a], [, b]) => (a.sort ?? 0) - (b.sort ?? 0),
  );
  for (const [name, service] of ordered) {
    const provider = PROVIDERS[service.provider ?? ''];
    const apiKey = service.options?.apiKey;
    const models = service.enabledModels ?? [];
    if (
      existing.has(name) ||
      service.enabled === false ||
      !provider ||
      typeof apiKey !== 'string' ||
      !apiKey ||
      !models.length
    )
      continue;
    const baseUrl =
      typeof service.options?.baseURL === 'string'
        ? service.options.baseURL
        : provider === 'alibaba'
          ? DASHSCOPE_CHINA
          : null;
    try {
      // Created under its key, which the plugin makes its name from and
      // agents name it by, then given the title config.yml writes it under.
      const created = await agents.models.services.create({
        title: name,
        provider: provider as never,
        baseUrl,
        apiKey,
        models: models.map((model) => ({
          value: model.value,
          ...(model.label ? { label: model.label } : {}),
        })),
      });
      if (service.title && service.title !== created.title)
        await agents.models.services.update(created.name, {
          title: service.title,
        });
    } catch (error) {
      app.container
        .resolve(loggingToken)
        .getLogger('itam-agents')
        .warn({ service: name, error }, 'model service not created');
    }
  }
}
