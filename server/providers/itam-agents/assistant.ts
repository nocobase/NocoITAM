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
 * ITAM's assistant, Asset Steward (资产管家), as an online agent: made once from the ITAM
 * assistant preset's instructions and actions, open to everyone, listing
 * every chat model of the enabled services in their order (the first its
 * default), and made the system default chat agent when none is set. The
 * marker keeps its id, so an agent an administrator changed, archived or
 * deleted stays as they left it: it is never recreated or rewritten.
 */
export const ASSISTANT_MARKER = 'agents-noco-v1';
const ASSISTANT_NAME = 'Asset Steward';
const ASSISTANT_NAME_TEXT = { key: 'ai.assistantName', ns: 'itam' };
/**
 * Its name until 2026-10-16, and the line of its instructions that said so:
 * an agent still carrying them is renamed at start (`renameFormer`).
 */
const FORMER_NAME = 'Noco';
const FORMER_INTRO =
  'You are Noco, the IT asset management (ITAM) assistant of this application.';

export async function provisionAssistant(
  agents: Agents,
  database: DatabaseManager,
  actions: readonly string[],
): Promise<void> {
  const marker = await readMarker(database, ASSISTANT_MARKER);
  if (marker) {
    if (typeof marker.agentId === 'string' && marker.agentId)
      await renameFormer(database, marker.agentId);
    return;
  }
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
  await nameAssistant(database, assistant.id);
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

/**
 * The assistant named in the viewer's language (资产管家 / Asset Steward).
 * @temporary(nocobase-official): `agents.create` takes no name translation,
 * so it is written on the plugin's row, as the work agents' are.
 */
async function nameAssistant(
  database: DatabaseManager,
  id: string,
): Promise<void> {
  await database
    .query()
    .updateTable('agAgents')
    .set({ nameText: ASSISTANT_NAME_TEXT })
    .where('id', '=', id)
    .where('name', '=', ASSISTANT_NAME)
    .execute()
    .catch(() => undefined);
}

/**
 * Noco became Asset Steward (2026-10-16). An assistant still named Noco takes
 * the new name, its translation and the new first line of its instructions;
 * one an administrator renamed keeps the name they gave it.
 */
async function renameFormer(
  database: DatabaseManager,
  id: string,
): Promise<void> {
  const row = await database
    .query()
    .selectFrom('agAgents')
    .select('instructions')
    .where('id', '=', id)
    .where('name', '=', FORMER_NAME)
    .executeTakeFirst<{ instructions: string | null }>()
    .catch(() => undefined);
  if (!row) return;
  const intro = ITAM_ASSISTANT_INSTRUCTIONS.split('\n')[0];
  await database
    .query()
    .updateTable('agAgents')
    .set({
      name: ASSISTANT_NAME,
      nameText: ASSISTANT_NAME_TEXT,
      ...(row.instructions?.includes(FORMER_INTRO)
        ? { instructions: row.instructions.replace(FORMER_INTRO, intro) }
        : {}),
    })
    .where('id', '=', id)
    .where('name', '=', FORMER_NAME)
    .execute()
    .catch(() => undefined);
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
