import type { AIChatMessage } from '@/extensions/nocobase-ai';

import { messageText, type ChatState } from './ai-chat.js';

type Part = AIChatMessage['parts'][number];

/** Where one question asked from the search stands in its chat. */
export interface SearchTurn {
  /** The chat has taken the question up (its message is in the chat). */
  readonly asked: boolean;
  readonly working: boolean;
  /** The tool call under way or last made, while working. */
  readonly step?: string;
  /** What Noco said after its last tool call. */
  readonly text: string;
  /** Noco proposed a change that only its conversation can confirm. */
  readonly decision: boolean;
  /** Why the turn failed, when it did. */
  readonly failed?: string;
  /** The conversation it runs in, once the plugin has named it. */
  readonly conversationId?: string;
}

/** The plugin's id for a conversation not yet sent (`AI_DRAFT_CONVERSATION_ID`). */
const DRAFT_CONVERSATION = '__draft__';

const toolNameOf = (part: Part): string | undefined =>
  part.type === 'dynamic-tool'
    ? part.toolName
    : part.type.startsWith('tool-')
      ? part.type.slice(5)
      : undefined;

/**
 * Page tools, which the plugin marks as needing approval and then approves
 * itself (`use-automatic-tool-approval.ts`): one waiting is a step under
 * way, not a question for the reader.
 */
const PAGE_TOOLS = new Set(['loadFrontendTool', 'executeFrontendTool']);

/** A tool call the plugin holds for approval. */
const awaitsApproval = (part: Part): boolean => {
  if (!toolNameOf(part) || !('state' in part)) return false;
  if (part.state === 'output-available' || part.state === 'output-error')
    return false;
  const metadata =
    'callProviderMetadata' in part
      ? (part.callProviderMetadata?.nocobase as
          { requiresApproval?: unknown } | undefined)
      : undefined;
  return metadata?.requiresApproval === true;
};

/** Reads the turn that `prompt` started out of the chat's state. */
export function readSearchTurn(chat: ChatState, prompt: string): SearchTurn {
  const askedAt = chat.messages.findLastIndex(
    (message) =>
      message.role === 'user' && messageText(message).includes(prompt),
  );
  if (askedAt === -1)
    return { asked: false, working: true, text: '', decision: false };
  const parts = chat.messages
    .slice(askedAt + 1)
    .flatMap((message) => message.parts);
  const lastToolAt = parts.findLastIndex((part) => toolNameOf(part));
  // The words between tool calls narrate the steps ("reading the business
  // context…"); the answer is what comes after the last one.
  const text = parts
    .slice(lastToolAt + 1)
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('')
    .trim();
  const waiting = parts.filter(awaitsApproval);
  const decision = waiting.some(
    (part) => !PAGE_TOOLS.has(toolNameOf(part) ?? ''),
  );
  // The chat goes quiet between steps — a page tool approving itself, a
  // tool's result about to be answered — so a turn is done only once it has
  // said something after its last call, or stopped on a change to confirm,
  // or failed.
  const working =
    chat.status === 'submitted' ||
    chat.status === 'streaming' ||
    (chat.status !== 'error' && !decision && (waiting.length > 0 || !text));
  const conversationId =
    chat.conversationId && chat.conversationId !== DRAFT_CONVERSATION
      ? chat.conversationId
      : undefined;
  return {
    asked: true,
    working,
    step:
      working && lastToolAt !== -1 ? toolNameOf(parts[lastToolAt]) : undefined,
    text,
    decision: !working && decision,
    failed:
      !working && chat.status === 'error'
        ? (chat.error?.message ?? '')
        : undefined,
    conversationId,
  };
}
