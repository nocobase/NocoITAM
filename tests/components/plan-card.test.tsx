import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { PlanCard } from '../../client/components/itam/ai/plan-card.js';
import type { Plan } from '../../client/lib/itam/plans.js';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@nocobase/app-client', () => ({
  useToaster: () => ({ show: () => undefined }),
}));
vi.mock('../../client/lib/itam/api.js', () => ({
  useApi: () => ({ request: async () => ({ data: {} }) }),
}));

const plan: Plan = {
  id: 'p1',
  title: 'Sort out the unregistered devices',
  summary: null,
  status: 'pending',
  revision: 1,
  failure: null,
  createdAt: '2026-10-16T10:00:00.000Z',
  decidedAt: null,
  steps: [
    {
      id: 's1',
      position: 0,
      op: 'assign',
      check: {
        title: 'Assign SH-LT-054 to Sun Qiang',
        fields: [{ field: 'deviceId', value: '$laptop' }],
      },
      status: 'pending',
      result: null,
    },
  ],
};

it('keeps the raw parameters folded until asked for', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PlanCard plan={plan} />
    </QueryClientProvider>,
  );
  expect(screen.getByText('Assign SH-LT-054 to Sun Qiang')).toBeTruthy();
  expect(screen.queryByText(/deviceId/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'ai.plans.showParams' }));
  expect(screen.getByText('deviceId: $laptop')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'ai.plans.hideParams' }));
  expect(screen.queryByText(/deviceId/)).toBeNull();
});

// Inside MDM 核对's follow-up (2026-10-21): the steps alone, no parameters.
it('offers no parameters inside a follow-up', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PlanCard plan={plan} bare />
    </QueryClientProvider>,
  );
  expect(screen.getByText('Assign SH-LT-054 to Sun Qiang')).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'ai.plans.showParams' }),
  ).toBeNull();
});

// A step left out of a plan carried out is not done, not struck through
// (2026-10-22).
it('marks a step left out of a carried-out plan as not run', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PlanCard
        plan={{
          ...plan,
          status: 'executed',
          steps: [{ ...plan.steps[0]!, status: 'removed' }],
        }}
        bare
      />
    </QueryClientProvider>,
  );
  const line = screen.getByText(plan.steps[0]!.check!.title);
  expect(line.className).not.toContain('line-through');
  expect(screen.getByText('ai.plans.notRun')).toBeTruthy();
});

// Not run, it can be ticked again (2026-10-22); settled since, 已处理.
it('ticks a step not run again, and marks one settled since', () => {
  const removed = { ...plan.steps[0]!, status: 'removed' as const };
  const onSkippedChange = vi.fn();
  const { unmount } = render(
    <QueryClientProvider client={new QueryClient()}>
      <PlanCard
        plan={{ ...plan, status: 'executed', steps: [removed] }}
        bare
        tickable={new Set([0])}
        onSkippedChange={onSkippedChange}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('checkbox'));
  expect(onSkippedChange).toHaveBeenCalledWith(new Set([0]));
  unmount();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PlanCard
        plan={{ ...plan, status: 'executed', steps: [removed] }}
        bare
        settled={new Set([0])}
        settledLabel='handled'
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText('handled')).toBeTruthy();
  expect(screen.queryByText('ai.plans.notRun')).toBeNull();
});
