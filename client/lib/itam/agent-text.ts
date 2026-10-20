import {
  useAgentText as usePluginAgentText,
  type AgentText,
} from '@nocobase/app-plugin-agents/client/chat';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo } from 'react';

import { ITAM_AGENT } from './ai-chat.js';

/**
 * An agent's name and description as the chat shows them, with the plugin's
 * native online agent named as ITAM names it — 资产管家, Asset Steward —
 * rather than the "Online agent" the plugin answers with (Agents plugin 1.0,
 * 2026-10-20: the plugin names that agent itself, and no setting renames
 * it). Every other agent as the plugin names it.
 */
export function useAgentText(): AgentText {
  const text = usePluginAgentText();
  const { t } = useTranslation();
  return useMemo(() => {
    const ours = (agent: object): boolean =>
      (agent as { readonly id?: unknown }).id === ITAM_AGENT;
    return {
      name: (agent) =>
        (ours(agent) ? t('ai.assistantName') : text.name(agent)) as never,
      description: (agent) =>
        ours(agent) ? t('ai.assistantDescription') : text.description(agent),
    };
  }, [text, t]);
}
