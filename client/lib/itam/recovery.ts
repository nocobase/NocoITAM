import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { masterDataPath, useApi } from './api.js';

/**
 * What is to be done with one thing a leaver still holds. The server decides
 * it from the record (`recoveryPlan`), so the page never judges a status
 * itself — the two would drift, and the assistant reads the same plan.
 */
export type RecoveryHandling =
  | 'return'
  | 'takeBack'
  | 'reclaim'
  | 'wait'
  | 'confirmConsumed';

export interface RecoveryItem {
  readonly kind: 'device' | 'stock' | 'seat';
  readonly id: string;
  readonly label: string;
  readonly handling: RecoveryHandling;
  readonly ownerId: string | null;
  readonly account?: string;
  /** What the action is addressed to: the device, its stock item, its entitlement. */
  readonly targetId: string;
  readonly quantity?: number;
  readonly status?: string;
  /** Which of the five asset types it is, for the row's own label. */
  readonly assetType:
    | 'device'
    | 'accessory'
    | 'consumable'
    | 'component'
    | 'entitlement';
}

/** A record that still names them, which only a person can hand over. */
export interface OwnedRecord {
  readonly collection: string;
  readonly id: string;
  readonly label: string;
}

export interface PersonRecovery {
  readonly employmentStatus: string | null;
  readonly leaveDate: string | null;
  readonly items: readonly RecoveryItem[];
  readonly owned: readonly OwnedRecord[];
}

/** Which handlings a person carries out here, rather than somewhere else. */
export const RECOVERY_ACTIONS: readonly RecoveryHandling[] = [
  'return',
  'takeBack',
  'reclaim',
];

export function usePersonRecovery(
  id: string | undefined,
): UseQueryResult<PersonRecovery> {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', masterDataPath('people'), 'recovery', id],
    queryFn: async () =>
      (
        await api.request<{ data: PersonRecovery }>({
          path: `${masterDataPath('people')}/${id}/recovery`,
        })
      ).data,
    enabled: Boolean(id),
  });
}
