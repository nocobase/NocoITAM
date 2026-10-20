import type { AIToolRendererMap } from '@nocobase/app-plugin-agents/client/chat';

import { ToolLine } from '@/components/itam/ai/tool-lines';

/**
 * Asset Steward's tools as they show in a conversation (Agents plugin 1.0,
 * 2026-10-20): one quiet line each (`ToolLine`) in place of the chat's raw
 * input and output. The names are the server's (`ITAM_TOOLS`,
 * `itam-agents/assistant.ts`). A proposed plan's card is not drawn here but
 * among the messages, from the conversation's plans (`chat-extensions.tsx`),
 * as it is for a plan an agent on a runner proposed.
 */
const TOOL_NAMES = [
  'itam_context',
  'itam_search',
  'itam_record_get',
  'itam_stats',
  'itam_availability',
  'itam_model_match',
  'itam_onboarding_plan',
  'itam_device_sync_review',
  'itam_plan_ops',
  'itam_plan_create',
  'itam_read_skill',
  // The web, through DeepSeek's Search and Fetch APIs (2026-10-20).
  'itam_web_search',
  'itam_web_fetch',
] as const;

/** Every ITAM tool drawn as its line (`AIToolRendererProvider`). */
export const ITAM_TOOL_RENDERERS: AIToolRendererMap = Object.fromEntries(
  TOOL_NAMES.map((name) => [name, ToolLine]),
);
