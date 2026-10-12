import { MAX_MODEL_ENTRIES } from '@nocobase/app-plugin-agents/shared/agents';
import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import type { DatabaseManager } from '@nocobase/db';

import {
  claimMarker,
  firstAccount,
  readMarker,
  writeMarker,
} from './markers.js';
import { ITAM_ASSISTANT_INSTRUCTIONS } from './preset.js';

/**
 * @temporary(nocobase-official): an agent the application ships is created
 * from code once, at start, because the Agents plugin has no way to ship one
 * (after NocoCRM's). Replace with the plugin's own mechanism when it has one.
 *
 * ITAM's assistant, Noco, as an online agent: made once from the ITAM
 * assistant preset's instructions and actions, open to everyone, listing
 * every chat model of the enabled services in their order (the first its
 * default), and made the system default chat agent when none is set. The
 * marker keeps its id, so an agent an administrator changed, archived or
 * deleted stays as they left it: it is never recreated or rewritten.
 */
export const ASSISTANT_MARKER = 'agents-noco-v1';
const ASSISTANT_NAME = 'Noco';

export async function provisionAssistant(
  agents: Agents,
  database: DatabaseManager,
  actions: readonly string[],
): Promise<void> {
  if (await readMarker(database, ASSISTANT_MARKER)) return;
  const creator = await firstAccount(database);
  if (!creator) return;
  if (
    !(await claimMarker(database, ASSISTANT_MARKER, {
      version: 1,
      agentId: null,
    }))
  )
    return;
  const modelEntries = await chatModelEntries(agents);
  const assistant = await agents.agents.create(creator, {
    name: ASSISTANT_NAME,
    type: 'online',
    description: 'IT asset management assistant',
    descriptionText: { key: 'ai.agentPreset.description', ns: 'itam' },
    instructions: ITAM_ASSISTANT_INSTRUCTIONS,
    actions: [...actions],
    access: 'everyone',
    ...(modelEntries.length ? { modelEntries } : {}),
  });
  const settings = await agents.chat.settings();
  if (!settings.defaultAgentId)
    await agents.chat.updateSettings(creator, {
      defaultAgentId: assistant.id,
    });
  await writeMarker(database, ASSISTANT_MARKER, {
    version: 1,
    agentId: assistant.id,
  });
}

/** The assistant's id, once provisioned; null before. */
export async function assistantId(
  database: DatabaseManager,
): Promise<string | null> {
  const marker = await readMarker(database, ASSISTANT_MARKER);
  return typeof marker?.agentId === 'string' && marker.agentId
    ? marker.agentId
    : null;
}

/**
 * Every chat model of the enabled services, in their order, as an agent's
 * model entries (the first its default).
 */
export async function chatModelEntries(
  agents: Agents,
): Promise<{ modelService: string; model: string }[]> {
  const services = (await agents.online.services.list()).filter(
    (service) => service.enabled,
  );
  return services
    .flatMap((service) =>
      service.models
        .filter((model) => model.kind === 'chat')
        .map((model) => ({
          modelService: service.name,
          model: model.value,
        })),
    )
    .slice(0, MAX_MODEL_ENTRIES);
}
