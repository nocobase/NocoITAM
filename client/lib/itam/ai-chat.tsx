import {
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
  type ReactElement,
} from 'react';

import {
  createAIChatController,
  type AIChatAttachment,
  type AIChatController,
  type AIChatMessage,
  type AIEmployeeTask,
  type AIWorkContextItem,
} from '@/extensions/nocobase-ai';

import { useAiStatus } from './ai.js';

/**
 * The assistant as the pages see it: whether a model is configured, and a
 * way to open the side panel with a prompt. The shell mounts the provider;
 * pages only ask. Without a configured model the quick entries and the
 * page shortcuts hide, and the pages keep their plain forms.
 */
export interface ItamAi {
  readonly available: boolean;
  readonly controller: AIChatController;
  readonly toggle: () => void;
  /** Whether the chat is expanded into a dialog rather than the side panel. */
  readonly expanded: boolean;
  readonly setExpanded: (expanded: boolean) => void;
  /**
   * Opens the panel and sends a prompt to the ITAM employee. `workContext`
   * names the page elements the prompt is about (`useAIPageElementHandle`):
   * their data goes with the message, and their frontend tools become
   * available to the employee. `autoSend: false` drafts the prompt in the
   * composer instead, for a request the user completes (attaching a file).
   */
  readonly ask: (
    prompt: string,
    options?: {
      readonly autoSend?: boolean;
      readonly workContext?: readonly AIWorkContextItem[];
      /** Files already uploaded (`AIService.uploadFile`), sent with it. */
      readonly attachments?: readonly AIChatAttachment[];
    },
  ) => void;
  /** Opens the panel on a conversation that already exists. */
  readonly openConversation: (conversationId: string) => void;
  /** The conversation the panel is asked to open, until it has. */
  readonly pendingConversation: Store<string | undefined>;
  /**
   * The search's own chat (`HiddenChat` in the shell): a second, unseen
   * conversation with the same employee, so asking from the search neither
   * opens the panel nor replaces the conversation in it.
   */
  readonly search: HiddenChat;
  /**
   * Receiving by delivery document has one of its own, for the same reason:
   * the assistant reads the document while the receiving form stays open.
   */
  readonly receipt: HiddenChat;
  /**
   * And so does AI 整理 in the new purchase order dialog: the assistant
   * reads what was pasted while the dialog stays open, and fills it.
   */
  readonly capture: HiddenChat;
}

/** Which unseen chat (`ItamAi.search`, `ItamAi.receipt`, `ItamAi.capture`). */
export type HiddenChatName = 'search' | 'receipt' | 'capture';

/** A conversation with the employee that no window shows. */
export interface HiddenChat {
  readonly controller: AIChatController;
  readonly state: Store<ChatState>;
  readonly ask: (
    prompt: string,
    workContext: readonly AIWorkContextItem[],
    options?: {
      /** Files already uploaded, sent with the message. */
      readonly attachments?: readonly AIChatAttachment[];
      /**
       * The skills and tools this conversation may use. The plugin enforces
       * the tool list on the server, so it is a boundary, not a request.
       */
      readonly skillSettings?: AIEmployeeTask['skillSettings'];
    },
  ) => void;
}

/** Where a chat stands, as its bridge publishes it. */
export interface ChatState {
  readonly status: 'submitted' | 'streaming' | 'ready' | 'error';
  readonly messages: readonly AIChatMessage[];
  readonly error?: Error;
  /** The conversation on screen; a draft until first sent. */
  readonly conversationId?: string;
  /** Deletes a conversation, as the history list does. */
  readonly removeConversation?: (conversationId: string) => Promise<void>;
}

export interface Store<T> {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: () => void) => () => void;
}

function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const IDLE: ChatState = { status: 'ready', messages: [] };

function createHiddenChat(): HiddenChat {
  const controller = createAIChatController();
  return {
    controller,
    state: createStore<ChatState>(IDLE),
    ask: (prompt, workContext, options) =>
      controller.triggerTask({
        aiEmployee: 'itam',
        task: {
          message: {
            user: prompt,
            workContext: [...workContext],
            attachments: options?.attachments
              ? [...options.attachments]
              : undefined,
          },
          skillSettings: options?.skillSettings,
          autoSend: true,
        },
        open: false,
      }),
  };
}

const ItamAiContext = createContext<ItamAi | undefined>(undefined);

export function ItamAiProvider({
  controller,
  children,
}: PropsWithChildren<{ readonly controller: AIChatController }>): ReactElement {
  const status = useAiStatus();
  const [expanded, setExpanded] = useState(false);
  const [pendingConversation] = useState(() =>
    createStore<string | undefined>(undefined),
  );
  const [search] = useState(createHiddenChat);
  const [receipt] = useState(createHiddenChat);
  const [capture] = useState(createHiddenChat);
  const value = useMemo<ItamAi>(
    () => ({
      available: Boolean(status.data?.configured && status.data.enabled),
      controller,
      expanded,
      setExpanded,
      pendingConversation,
      search,
      receipt,
      capture,
      toggle: () => controller.setOpen(!controller.getSnapshot().open),
      // Open first: the chat mounts inside the panel, and the controller
      // holds the task until that chat binds to it.
      ask: (prompt, options) => {
        controller.open();
        controller.triggerTask({
          aiEmployee: 'itam',
          task: {
            message: {
              user: prompt,
              workContext: options?.workContext
                ? [...options.workContext]
                : undefined,
              attachments: options?.attachments
                ? [...options.attachments]
                : undefined,
            },
            autoSend: options?.autoSend ?? true,
          },
          open: true,
        });
      },
      // The panel's chat selects it once mounted (`PendingConversation` in
      // the shell).
      openConversation: (conversationId) => {
        pendingConversation.set(conversationId);
        controller.open();
      },
    }),
    [
      controller,
      status.data,
      expanded,
      pendingConversation,
      search,
      receipt,
      capture,
    ],
  );
  return (
    <ItamAiContext.Provider value={value}>{children}</ItamAiContext.Provider>
  );
}

/** Undefined outside the application shell (settings, dev). */
// eslint-disable-next-line react-refresh/only-export-components -- the hook and its provider ship together
export function useItamAi(): ItamAi | undefined {
  return useContext(ItamAiContext);
}

/** An unseen chat as it stands; idle outside the shell. */
// eslint-disable-next-line react-refresh/only-export-components -- the hook and its provider ship together
export function useHiddenChat(name: HiddenChatName): ChatState {
  const ai = useContext(ItamAiContext);
  return useSyncExternalStore(
    ai?.[name].state.subscribe ?? noSubscription,
    ai?.[name].state.get ?? idle,
  );
}

/** The search's chat as it stands; idle outside the shell. */
// eslint-disable-next-line react-refresh/only-export-components -- the hook and its provider ship together
export const useItamSearchChat = (): ChatState => useHiddenChat('search');

const noSubscription = () => () => undefined;
const idle = () => IDLE;

/** A message's text, its text parts joined. */
// eslint-disable-next-line react-refresh/only-export-components -- a helper of the chat state above
export const messageText = (message: AIChatMessage): string =>
  message.parts
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('');

// eslint-disable-next-line react-refresh/only-export-components -- re-exported for the shell
export { createAIChatController };
