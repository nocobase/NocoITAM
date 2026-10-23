import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { masterDataPath, useApi } from './api.js';
import { addDays } from './format.js';

/** Mirrors `OnboardingPlan` in `server/providers/itam/onboarding.ts`. */
export interface PlanThing {
  readonly type: 'device' | 'stock' | 'seat';
  readonly id: string;
  readonly label: string;
  readonly state?: 'assigned' | 'reserved';
  readonly quantity?: number;
  /** A subscription seat: held under an account, the person's e-mail. */
  readonly needsAccount?: boolean;
  readonly account?: string;
  /** Chosen by Asset Steward in the background, with the reason it gave. */
  readonly source?: 'noco';
  readonly reason?: string;
  /** The device the rule would have proposed, when Asset Steward chose another. */
  readonly instead?: { readonly id: string; readonly label: string };
  /** Planned rather than in stock: where it comes from, and from when. */
  readonly supply?: PlanSupply;
}

/** An open purchase order, or somebody leaving who hands it back. */
export interface PlanSupply {
  readonly kind: 'order' | 'return';
  /** The first day it can be handed over; null for an order not placed. */
  readonly availableOn: string | null;
  readonly orderId?: string;
  readonly orderNo?: string;
  readonly orderStatus?: string;
  readonly fromId?: string;
  readonly fromName?: string;
}

/** Asset Steward's latest background run for the joiner. */
export interface PlanAdvice {
  readonly runId: string;
  readonly status: 'running' | 'ready' | 'failed';
  readonly summary: string | null;
  readonly failure: string | null;
  readonly sessionId: string | null;
  readonly actorId: string;
  readonly createdAt: string;
  readonly finishedAt: string | null;
}

export interface OnboardingPlanLine {
  readonly key: string;
  readonly target: {
    readonly type: 'model' | 'category' | 'softwareProduct';
    readonly id: string;
    readonly name: string;
  };
  readonly kind: 'device' | 'stock' | 'entitlement';
  /** A shortfall's purchase line type; null when nothing says. */
  readonly itemType: string | null;
  readonly required: number;
  readonly prepared: readonly PlanThing[];
  readonly preparedCount: number;
  readonly proposals: readonly PlanThing[];
  /** Expected in time: on an open order, or back from somebody leaving. */
  readonly planned: readonly PlanThing[];
  /** Marked 不需要 for this person. */
  readonly waived: boolean;
  readonly missing: number;
  /** How many of `planned` are on order, and how many come back. */
  readonly onOrder: number;
  readonly returning: number;
  readonly shortfall: number;
  /** With a shortfall, the last day to order it. */
  readonly orderBy: string | null;
}

export interface OnboardingPlan {
  readonly personId: string;
  readonly hireDate: string | null;
  readonly kit: {
    readonly id: string;
    readonly name: string;
    readonly departmentId: string;
    readonly position: string | null;
  } | null;
  readonly lines: readonly OnboardingPlanLine[];
  /** Over the items not marked 不需要. */
  readonly prepared: number;
  readonly required: number;
  /** How many items are marked 不需要. */
  readonly waived: number;
  readonly hasDevice: boolean;
  /** Open orders bought for them or drawn on by the plan. */
  readonly orders: readonly {
    readonly id: string;
    readonly orderNo: string;
    readonly status: string;
  }[];
  readonly advice: PlanAdvice | null;
}

/** Where a kit item's own record is, by what it names. */
export const TARGET_ROUTES: Readonly<
  Record<OnboardingPlanLine['target']['type'], string>
> = {
  model: 'models',
  category: 'categories',
  softwareProduct: 'software-products',
};

/** A person's 入职配备 plan: their kit, what they have, what stock would add. */
export function useOnboardingPlan(
  personId: string | undefined,
  enabled = true,
): UseQueryResult<OnboardingPlan | null> {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', masterDataPath('people'), 'onboarding', personId],
    queryFn: async () =>
      (
        await api.request<{ data: OnboardingPlan | null }>({
          path: `${masterDataPath('people')}/${personId}/onboarding`,
        })
      ).data,
    enabled: enabled && Boolean(personId),
    // While Asset Steward is choosing, look again until it has; the run's end also
    // reaches open pages through the change signal.
    refetchInterval: (query) =>
      query.state.data?.advice?.status === 'running' ? 5_000 : false,
  });
}

/**
 * Whether somebody is a joiner: entered in the register no more than 30 days
 * before their first day rather than long after it. Mirrors `isJoiner` in
 * `server/providers/itam/onboarding.ts`.
 */
export function isJoiner(hireDate: unknown, createdAt: unknown): boolean {
  if (typeof hireDate !== 'string' || !hireDate) return false;
  if (typeof createdAt !== 'string' || !createdAt) return false;
  return hireDate.slice(0, 10) >= addDays(createdAt.slice(0, 10), -30);
}

/** Whether a plan has everything in hand: each item held, reserved or 不需要. */
export function isPrepared(plan: OnboardingPlan): boolean {
  return plan.kit ? plan.prepared >= plan.required : plan.hasDevice;
}
