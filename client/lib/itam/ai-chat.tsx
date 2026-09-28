import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from 'react';

import {
  createAIChatController,
  type AIChatController,
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
    },
  ) => void;
}

const ItamAiContext = createContext<ItamAi | undefined>(undefined);

export function ItamAiProvider({
  controller,
  children,
}: PropsWithChildren<{ readonly controller: AIChatController }>): ReactElement {
  const status = useAiStatus();
  const [expanded, setExpanded] = useState(false);
  const value = useMemo<ItamAi>(
    () => ({
      available: Boolean(status.data?.configured && status.data.enabled),
      controller,
      expanded,
      setExpanded,
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
            },
            autoSend: options?.autoSend ?? true,
          },
          open: true,
        });
      },
    }),
    [controller, status.data, expanded],
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

// eslint-disable-next-line react-refresh/only-export-components -- re-exported for the shell
export { createAIChatController };
