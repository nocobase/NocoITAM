import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { masterDataPath, useApi } from './api.js';

/** Mirrors `OnboardingPlan` in `server/providers/itam/onboarding.ts`. */
export interface PlanThing {
  readonly type: 'device' | 'stock' | 'seat';
  readonly id: string;
  readonly label: string;
  readonly state?: 'assigned' | 'reserved';
  readonly quantity?: number;
}

export interface OnboardingPlanLine {
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
  readonly shortfall: number;
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
  readonly prepared: number;
  readonly required: number;
  readonly hasDevice: boolean;
}

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
  });
}
