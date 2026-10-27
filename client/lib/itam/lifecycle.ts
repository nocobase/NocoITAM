import type { LifecycleDescription } from '@nocobase/lifecycle';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from './api.js';

/**
 * A lifecycle as 设置 → 报废流程 reads it (2026-10-18): the states and moves from source
 * (`GET <path>/lifecycle`), and the approver range set on it.
 */
export function useLifecycleDescription(path: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', path, 'lifecycle'],
    queryFn: async () =>
      (
        await api.request<{
          data: { readonly description: LifecycleDescription };
        }>({ path: `${path}/lifecycle` })
      ).data.description,
    // Declared in source: it changes with a release, not while a page is open.
    staleTime: Infinity,
  });
}

/** 设置 → 报废流程: whom a submitter may ask to approve a disposal. */
export interface ApproverRange {
  /** Everyone who may approve, or only the sets and people chosen. */
  readonly anyone: boolean;
  readonly roles: readonly string[];
  readonly users: readonly string[];
  readonly revision: number;
  readonly updatedById: string | null;
  readonly updatedAt: string | null;
  readonly roleOptions: readonly {
    readonly key: string;
    readonly title: string;
  }[];
  readonly userOptions: readonly ApproverPerson[];
  /** Whom a submitter may pick under the saved range. */
  readonly approvers: readonly ApproverPerson[];
}

export interface ApproverPerson {
  readonly id: string;
  readonly name: string;
  readonly roles?: readonly { readonly key: string; readonly title: string }[];
}

export function useApproverRange(path: string, enabled = true) {
  const api = useApi();
  return useQuery({
    enabled,
    queryKey: ['itam', path, 'lifecycle', 'approvers'],
    queryFn: async () =>
      (
        await api.request<{ data: ApproverRange }>({
          path: `${path}/lifecycle/approvers`,
        })
      ).data,
  });
}

/**
 * A key for one save, kept for the retries of that save: the server saves
 * a resent request once. Not `crypto.randomUUID()`, which a plain-HTTP
 * address does not have.
 */
export function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

export function useSaveApproverRange(path: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      readonly anyone: boolean;
      readonly roles: readonly string[];
      readonly users: readonly string[];
      readonly revision: number;
      readonly requestId: string;
    }) =>
      (
        await api.request<{ data: ApproverRange }>({
          path: `${path}/lifecycle/approvers`,
          method: 'PUT',
          json: input,
        })
      ).data,
    onSettled: () =>
      client.invalidateQueries({
        queryKey: ['itam', path, 'lifecycle', 'approvers'],
      }),
  });
}
