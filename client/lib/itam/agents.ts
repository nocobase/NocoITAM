import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useApi } from './api.js';

/**
 * The work agents on the client (2026-10-16, plan "Work agents", step 1;
 * `server/routes/itam/agents.ts`): 智能体工作's overview, switches and
 * runs; 收件箱's 待我决定 and its count; and one record's newest review,
 * asked for, redone, decided or set aside.
 */

export const AGENTS_PATH = 'itam/agents';
export const INBOX_PATH = 'itam/inbox';
export const AGENT_RUNS_PATH = 'itam/agentRuns';

export type AgentName = 'approvalReview' | 'deviceSync';
export type RunStatus =
  'running' | 'pending' | 'accepted' | 'dismissed' | 'failed' | 'superseded';

export interface ApprovalReviewResult {
  readonly recommendation: 'approve' | 'conditional' | 'reject' | 'needMore';
  readonly summary: string;
  readonly asked: string;
  readonly reasons: readonly string[];
  readonly alternatives: string | null;
  readonly precedents: string;
  readonly risks: readonly string[];
  readonly missing: readonly string[];
  readonly conditions: string | null;
  readonly comment: string;
}

/**
 * What MDM 跟进 left (2026-10-17): the differences it looked at, the plan it
 * proposed for the ones a plan can settle, and notes for the rest.
 */
export interface DeviceSyncResult {
  readonly items: readonly {
    readonly key: string;
    readonly kind: 'userMismatch' | 'unregistered';
    readonly subject: string;
    readonly label: string;
  }[];
  readonly planId: string | null;
  readonly notes: readonly string[];
  readonly summary: string;
}

interface RunBase {
  readonly id: string;
  readonly trigger: string;
  readonly startedById: string | null;
  readonly subjectId: string;
  readonly refId: string | null;
  readonly deciderId: string | null;
  readonly status: RunStatus;
  readonly failure: string | null;
  readonly revisesId: string | null;
  readonly instruction: string | null;
  readonly decision: 'approved' | 'rejected' | null;
  readonly comment: string | null;
  readonly decidedById: string | null;
  readonly decidedAt: string | null;
  readonly model: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** The request it is about, as its approval names it. */
  readonly title: string | null;
}

export interface ApprovalReviewRun extends RunBase {
  readonly agent: 'approvalReview';
  readonly subjectType: 'purchaseOrders' | 'disposals';
  /** For the run's decider alone; null for anyone else. */
  readonly result: ApprovalReviewResult | null;
}

export interface DeviceSyncRun extends RunBase {
  readonly agent: 'deviceSync';
  readonly subjectType: 'deviceSync';
  /** For the run's decider alone; null for anyone else. */
  readonly result: DeviceSyncResult | null;
}

export type AgentRun = ApprovalReviewRun | DeviceSyncRun;

export interface RunCounts {
  readonly runs: number;
  readonly accepted: number;
  readonly dismissed: number;
  readonly waiting: number;
  readonly failed: number;
}

export interface AgentOverview {
  readonly agent: AgentName;
  readonly agentId: string | null;
  readonly skill: string;
  readonly skillId: string | null;
  readonly model: {
    readonly modelService: string;
    readonly model: string;
  } | null;
  readonly triggers: readonly string[];
  readonly switches: {
    readonly enabled: boolean;
    readonly triggers: Readonly<Record<string, boolean>>;
  };
  readonly working: number;
  readonly last7: RunCounts;
  readonly last30: RunCounts;
}

const keys = {
  agents: ['itam', AGENTS_PATH] as const,
  inbox: ['itam', INBOX_PATH] as const,
  runs: ['itam', AGENT_RUNS_PATH] as const,
};

/** Every query a decision or a new run changes. */
function useRefreshRuns(): () => Promise<void> {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.agents }),
      queryClient.invalidateQueries({ queryKey: keys.inbox }),
      queryClient.invalidateQueries({ queryKey: keys.runs }),
    ]);
  };
}

/** A run still at work is looked at again every few seconds. */
const whileWorking = (runs: readonly (AgentRun | null | undefined)[]) =>
  runs.some((run) => run?.status === 'running') ? 4_000 : false;

export function useAgentsOverview(): UseQueryResult<readonly AgentOverview[]> {
  const api = useApi();
  return useQuery({
    queryKey: keys.agents,
    queryFn: async () =>
      (await api.request<{ data: AgentOverview[] }>({ path: AGENTS_PATH }))
        .data,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((agent) => agent.working > 0)
        ? 4_000
        : false,
  });
}

export function useAgentRuns(
  agent: AgentName,
  status: RunStatus | null,
): UseQueryResult<readonly AgentRun[]> {
  const api = useApi();
  return useQuery({
    queryKey: [...keys.agents, agent, 'runs', status],
    queryFn: async () =>
      (
        await api.request<{ data: AgentRun[] }>({
          path: `${AGENTS_PATH}/${agent}/runs`,
          query: status ? { status } : {},
        })
      ).data,
    refetchInterval: (query) => whileWorking(query.state.data ?? []),
  });
}

export function useSaveAgentSwitch(
  agent: AgentName,
): UseMutationResult<
  unknown,
  Error,
  { readonly enabled?: boolean; readonly triggers?: Record<string, boolean> }
> {
  const api = useApi();
  const refresh = useRefreshRuns();
  return useMutation({
    mutationFn: (input) =>
      api.request({
        path: `${AGENTS_PATH}/${agent}/switches`,
        method: 'PUT',
        json: input,
      }),
    onSuccess: refresh,
  });
}

export interface Inbox {
  readonly open: readonly AgentRun[];
  readonly handled: readonly AgentRun[];
}

export function useInbox(): UseQueryResult<Inbox> {
  const api = useApi();
  return useQuery({
    queryKey: keys.inbox,
    queryFn: async () =>
      (await api.request<{ data: Inbox }>({ path: INBOX_PATH })).data,
    refetchInterval: (query) => whileWorking(query.state.data?.open ?? []),
  });
}

/** How many runs wait for the reader: the 收件箱 entry's count. */
export function useInboxCount(enabled = true): UseQueryResult<number> {
  const api = useApi();
  return useQuery({
    queryKey: [...keys.inbox, 'count'],
    queryFn: async () =>
      (
        await api.request<{ data: { waiting: number } }>({
          path: `${INBOX_PATH}/count`,
        })
      ).data.waiting,
    enabled,
    refetchInterval: 60_000,
  });
}

/** A record's newest review; null when there is none. */
export function useLatestReview(
  subjectType: 'purchaseOrders' | 'disposals',
  subjectId: string,
  enabled = true,
): UseQueryResult<ApprovalReviewRun | null> {
  const api = useApi();
  return useQuery({
    queryKey: [...keys.runs, 'latest', subjectType, subjectId],
    queryFn: async () =>
      (
        await api.request<{ data: ApprovalReviewRun | null }>({
          path: `${AGENT_RUNS_PATH}/latest`,
          query: { agent: 'approvalReview', subjectType, subjectId },
        })
      ).data,
    enabled: enabled && Boolean(subjectId),
    refetchInterval: (query) => whileWorking([query.state.data]),
  });
}

/** The approver asks for a review, or redoes the waiting one in their words. */
export function useAskReview(): UseMutationResult<
  unknown,
  Error,
  {
    readonly subjectType: 'purchaseOrders' | 'disposals';
    readonly subjectId: string;
    readonly revise?: { readonly runId: string; readonly instruction: string };
  }
> {
  const api = useApi();
  const refresh = useRefreshRuns();
  return useMutation({
    mutationFn: (input) =>
      api.request({
        path: AGENT_RUNS_PATH,
        method: 'POST',
        json: { agent: 'approvalReview', ...input },
      }),
    onSuccess: refresh,
  });
}

/**
 * MDM 跟进 on MDM 核对 (2026-10-17): the reader's own differences worked out
 * now; the runs it started, none when there is nothing new for them.
 */
export function useAskFollowUp(): UseMutationResult<
  readonly AgentRun[],
  Error,
  void
> {
  const api = useApi();
  const refresh = useRefreshRuns();
  return useMutation({
    mutationFn: async () =>
      (
        await api.request<{ data: readonly AgentRun[] }>({
          path: 'itam/device-sync/followUp',
          method: 'POST',
        })
      ).data,
    onSuccess: refresh,
  });
}

/** The approver approves or rejects from the review; the request changes with it. */
export function useDecideReview(): UseMutationResult<
  unknown,
  Error,
  {
    readonly run: ApprovalReviewRun;
    readonly decision: 'approved' | 'rejected';
    readonly comment: string;
  }
> {
  const api = useApi();
  const queryClient = useQueryClient();
  const refresh = useRefreshRuns();
  return useMutation({
    mutationFn: ({ run, decision, comment }) =>
      api.request({
        path: `${AGENT_RUNS_PATH}/${run.id}/decide`,
        method: 'POST',
        json: { decision, comment },
      }),
    onSuccess: async (_data, { run }) => {
      await refresh();
      // The request itself changed: its page, its list, the approvals queue.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [
            'itam',
            run.subjectType === 'purchaseOrders'
              ? 'itam/purchase-orders'
              : 'itam/disposals',
          ],
        }),
        queryClient.invalidateQueries({ queryKey: ['itam', 'itam/approvals'] }),
      ]);
    },
  });
}

export function useDismissReview(): UseMutationResult<
  unknown,
  Error,
  AgentRun
> {
  const api = useApi();
  const refresh = useRefreshRuns();
  return useMutation({
    mutationFn: (run) =>
      api.request({
        path: `${AGENT_RUNS_PATH}/${run.id}/dismiss`,
        method: 'POST',
        json: {},
      }),
    onSuccess: refresh,
  });
}
