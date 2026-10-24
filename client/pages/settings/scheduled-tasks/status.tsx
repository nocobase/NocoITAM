import type { ReactElement } from 'react';

import { ToneBadge as Badge } from '@/components/settings/tone-badge';

import { useAdminText } from '../common/hooks.js';
import { scheduleState, type Schedule } from './types.js';

/**
 * A schedule's state in words: no longer defined (inactive) before paused, and a second badge when its target is not
 * ready to run.
 */
export function ScheduleStatusBadge({
  schedule,
}: {
  readonly schedule: Schedule;
}): ReactElement {
  const { text } = useAdminText();
  const state = scheduleState(schedule);
  const target = schedule.targetSummary.state ?? schedule.targetState;
  return (
    <span className='inline-flex flex-wrap gap-1'>
      <Badge
        variant={
          state === 'active'
            ? 'success'
            : state === 'inactive'
              ? 'warning'
              : 'muted'
        }
      >
        {text(`schedules.status.${state}`)}
      </Badge>
      {target !== 'ready' ? (
        <Badge variant='warning'>{text(`schedules.target.${target}`)}</Badge>
      ) : null}
    </span>
  );
}
