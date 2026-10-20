import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApi } from './api.js';

/** The assistant's own endpoints: status, form readings, receipt runs. */
export const AI_PATH = 'itam/ai';

/**
 * Whether the assistant is available: a model to ask (Asset Steward's, else the
 * system's default chat model, on the Agents plugin).
 */
export interface AiStatus {
  readonly available: boolean;
  /** The model a conversation answers with unless another is chosen. */
  readonly model: {
    readonly modelService: string;
    readonly model: string;
  } | null;
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

/** What a form reading answers (`POST /itam/ai/read`). */
export interface AiReading {
  readonly reading: Record<string, unknown> | null;
  readonly said: string;
}

export type AiReadingTask =
  | 'purchaseOrder'
  | 'purchaseLines'
  | 'model'
  | 'softwareProduct'
  | 'deliveryDocument'
  | 'repairTriage'
  | 'purchaseQuote'
  | 'quoteRecommendation';
