import { useMemo } from 'react';

import { useAdminQueryKey } from '../common/hooks.js';

// The scheduler plugin's API shapes (`/api/scheduler`, documented under the
// Scheduler tag of the API document); the plugin ships no client types.
export type TargetState = 'ready' | 'disabled' | 'missing' | 'invalid';

export interface Schedule {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly description?: string;
  readonly cron: string;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly lifecycleState: 'active' | 'inactive';
  readonly inactiveReason?: string;
  readonly runCount: number;
  readonly completedCount: number;
  readonly nextRunAt?: string;
  readonly lastRunAt?: string;
  readonly scheduleStatus: 'active' | 'paused';
  readonly targetState: TargetState;
  readonly targetSummary: {
    readonly targetLabel: string;
    readonly description?: string;
    readonly state?: TargetState;
  };
}

export type OccurrenceStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'timed_out'
  | 'triggered';

export interface Occurrence {
  readonly id: string;
  readonly status: OccurrenceStatus;
  readonly reason?: string;
  readonly executionCount: number;
  readonly startedAt: string;
  readonly acceptedAt?: string;
  readonly finishedAt?: string;
}

export interface SchedulesOutletContext {
  readonly reload: () => void;
}

/** What a schedule's status reads as: inactive when the application no longer defines it, else active or paused. */
export function scheduleState(
  schedule: Schedule,
): 'active' | 'paused' | 'inactive' {
  return schedule.lifecycleState === 'inactive'
    ? 'inactive'
    : schedule.scheduleStatus;
}

export function useSchedulesKey(): readonly string[] {
  const base = useAdminQueryKey();
  return useMemo(() => [...base, 'schedules'], [base]);
}
