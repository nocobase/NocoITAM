import type {
  ChatExtensions,
  ChatTimelineItem,
} from '@nocobase/app-plugin-agents/client/chat';
import { useQuery } from '@tanstack/react-query';

import { PlanCard } from '@/components/itam/ai/plan-card';

import { useApi } from './api.js';
import { PLANS_PATH, type Plan } from './plans.js';

/**
 * What ITAM adds to the Agents plugin's chat (template 1.0.0-beta.64): the
 * plans a conversation proposed, as cards placed among its messages, and the
 * wording of the news a decision on one sends back (`plan-news.ts`).
 */
/** The conversation's plans, refetched whenever its messages move on. */
function usePlans(conversationId: string, revision: number) {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', PLANS_PATH, conversationId, revision],
    queryFn: async () =>
      (
        await api.request<{ data: Plan[] }>({
          path: PLANS_PATH,
          query: { conversationId, pageSize: '100' },
        })
      ).data,
    // A new conversation has no id yet, and the list unfiltered is every
    // plan the reader may see (2026-10-16: 讨论 opened on someone's MDM
    // plans).
    enabled: conversationId !== '',
    staleTime: 5_000,
    placeholderData: (previous) => previous,
  });
}

function usePlanTimeline(
  conversationId: string,
  revision: number,
): readonly ChatTimelineItem[] {
  const plans = usePlans(conversationId, revision);
  if (!conversationId) return [];
  return (plans.data ?? []).map((plan) => ({
    key: `itam-plan-${plan.id}`,
    at: plan.createdAt,
    node: <PlanCard plan={plan} />,
  }));
}

/** What ITAM adds to the chat panel (`ChatExtensionsContext`). */
export const ITAM_CHAT_EXTENSIONS: ChatExtensions = {
  useTimelineItems: usePlanTimeline,
  newsText: (notice, t) =>
    notice.type === 'planDecided'
      ? t(`ai.plans.news.${notice.params?.decision ?? 'executed'}`, {
          ns: 'itam',
          title: notice.title,
        })
      : null,
};
