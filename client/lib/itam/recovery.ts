import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { masterDataPath, useApi } from './api.js';

/**
 * What is to be done with one thing a leaver still holds. The server decides
 * it from the record (`recoveryPlan`), so the page never judges a status
 * itself — the two would drift, and the assistant reads the same plan.
 */
export type RecoveryHandling =
  'return' | 'takeBack' | 'reclaim' | 'wait' | 'confirmConsumed';

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
  /**
   * What is installed in it, for a device. A component belongs to the device
   * and goes back inside it, so it is never a line of its own — but handing
   * the laptop back hands these back with it.
   */
  readonly installed?: readonly {
    readonly id: string;
    /** The component's own record, which its name opens. */
    readonly stockItemId: string;
    readonly name: string;
    readonly quantity: number;
  }[];
  /** The repair a device in the shop is waiting on, named so it can be opened. */
  readonly waitingOn?: { readonly id: string; readonly label: string };
  /** Which of the five asset types it is, for the row's own label. */
  readonly assetType:
    'device' | 'accessory' | 'consumable' | 'component' | 'entitlement';
}

/** A record that still names them, which only a person can hand over. */
export interface OwnedRecord {
  readonly collection: string;
  readonly id: string;
  readonly label: string;
  /** Which field names them: the 负责人, on every record that names one. */
  readonly field: 'ownerId';
  /** Who that field names now, which is somebody else once handed over. */
  readonly ownerId?: string | null;
  /** Which asset type it is, where it is an asset at all. */
  readonly assetType?: string;
}

export interface PersonRecovery {
  readonly name?: string | null;
  readonly employmentStatus: string | null;
  readonly leaveDate: string | null;
  readonly items: readonly RecoveryItem[];
  /**
   * What the snapshot taken at leaving held and nobody holds now: the part
   * of the recovery that is done. It is listed with the rest, so the reader
   * sees what was settled as well as what is left.
   */
  readonly settled: readonly RecoveryItem[];
  readonly owned: readonly OwnedRecord[];
  /** Records that named them at leaving and name somebody else now. */
  readonly settledOwned: readonly OwnedRecord[];
  /**
   * How much of the recovery is done, against the snapshot taken when they
   * left. Null where none was taken — somebody still here, or somebody who
   * left before the snapshot existed — because a figure with no denominator
   * is worse than none.
   */
  readonly progress: { readonly done: number; readonly total: number } | null;
  /**
   * The sign-in they had, if any, and whether it still signs in. Leaving
   * disables it (`leaver-accounts.ts`) unless the platform refuses — the
   * last administrator — or it is the reader's own, so the page says it was
   * done, or reminds the reader when it was not. `canDisable` says whether
   * this reader may — the users page is root's.
   */
  readonly account?: {
    readonly name: string;
    readonly username: string | null;
    readonly disabled: boolean;
    /** Disabled by leaving, rather than by somebody's hand. */
    readonly disabledOnLeaving: boolean;
    readonly canDisable: boolean;
  } | null;
}

/** The query a person's recovery plan is read under, wherever it is read. */
export function personRecoveryQuery(
  api: ReturnType<typeof useApi>,
  id: string | undefined,
) {
  return {
    queryKey: ['itam', masterDataPath('people'), 'recovery', id],
    queryFn: async () =>
      (
        await api.request<{ data: PersonRecovery }>({
          path: `${masterDataPath('people')}/${id}/recovery`,
        })
      ).data,
  };
}

export function usePersonRecovery(
  id: string | undefined,
): UseQueryResult<PersonRecovery> {
  const api = useApi();
  return useQuery({ ...personRecoveryQuery(api, id), enabled: Boolean(id) });
}
