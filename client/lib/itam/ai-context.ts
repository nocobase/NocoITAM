import type { RefCallback } from 'react';

import {
  useAIPageElementHandle,
  type AIChatAttachment,
  type AIFrontendToolRegistration,
} from '@/extensions/nocobase-ai';

import { useItamAi } from './ai-chat.js';

/**
 * A part of the page the ITAM assistant can be asked about: it registers as
 * page context (attach `ref` to the visible element), and `ask` opens the
 * assistant with a prompt about it — the element's `getContext()` data goes
 * with the message, and its frontend `tools` become the assistant's to call.
 * `available` is false when no model is configured, so the page hides the
 * shortcut and keeps its plain controls.
 */
export function useAiPageContext(descriptor: {
  readonly id: string;
  readonly title: string;
  readonly kind?: string;
  readonly getContext: () => unknown;
  /** Keep the array's identity stable (useMemo): a new one re-registers. */
  readonly tools?: AIFrontendToolRegistration[];
}): {
  readonly ref: RefCallback<HTMLElement>;
  readonly available: boolean;
  readonly ask: (
    prompt: string,
    options?: {
      readonly autoSend?: boolean;
      readonly attachments?: readonly AIChatAttachment[];
      readonly webSearch?: boolean;
      readonly model?: { readonly llmService?: string; readonly model: string };
    },
  ) => void;
} {
  const ai = useItamAi();
  const handle = useAIPageElementHandle(descriptor);
  return {
    ref: handle.ref,
    available: Boolean(ai?.available),
    ask: (prompt, options) =>
      ai?.ask(prompt, { ...options, workContext: [handle.context] }),
  };
}
