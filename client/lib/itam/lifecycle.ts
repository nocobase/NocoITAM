import type { LifecycleDescription } from '@nocobase/lifecycle';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from './api.js';

/**
 * A record's lifecycle as its 流程 tab reads it (2026-10-18,
 * docs/adr/0001-record-lifecycles.md): the states and moves from source
 * (`GET <path>/lifecycle`), and where one record stands on them
 * (`GET <path>/:id/lifecycle`). Under the `itam` key, so an action that
 * moves the record refreshes it with the rest of the page.
 */
export interface RecordLifecycle {
  readonly state: string;
  readonly version: number | null;
  /** What the reader may do next, and why not where they may not. */
  readonly available: readonly {
    readonly name: string;
    readonly allowed: boolean;
    readonly blockers: readonly {
      readonly code: string;
      readonly kind: string;
    }[];
  }[];
  /** Every move it made, oldest first; `$create` is its creation. */
  readonly history: readonly {
    readonly transition: string;
    readonly from: string | null;
    readonly to: string;
    readonly actorId: string;
    readonly at: string;
  }[];
  /** What the moves owed outside the database, such as notifications. */
  readonly effects: readonly {
    readonly effect: string;
    readonly status: string;
    readonly attempts: number;
  }[];
}

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

export function useRecordLifecycle(path: string, id: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', path, id, 'lifecycle'],
    queryFn: async () =>
      (
        await api.request<{ data: RecordLifecycle }>({
          path: `${path}/${encodeURIComponent(id)}/lifecycle`,
        })
      ).data,
    enabled: Boolean(id),
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

export function useDisposalApproverRange(path: string) {
  const api = useApi();
  return useQuery({
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

export function useSaveDisposalApproverRange(path: string) {
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
