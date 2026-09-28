import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApi } from './api.js';

/** Whether the assistant is available, and the write tools' pre-check. */
export const AI_PATH = 'itam/ai';

/**
 * What the AI employee plugin says about the assistant: a model it can use
 * (`configured`) and Ava switched on at 设置 → AI 员工 (`enabled`).
 */
export interface AiStatus {
  readonly configured: boolean;
  readonly enabled: boolean;
  readonly employee: string;
}

export function useAiStatus(): UseQueryResult<AiStatus> {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', AI_PATH, 'status'],
    queryFn: async () =>
      (await api.request<{ data: AiStatus }>({ path: `${AI_PATH}/status` }))
        .data,
    staleTime: 5 * 60_000,
  });
}
