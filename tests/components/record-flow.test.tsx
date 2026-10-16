import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { RecordFlow } from '../../client/components/itam/record-flow.js';

const state = vi.hoisted(() => ({
  diagram: undefined as Record<string, unknown> | undefined,
  effects: [] as { effect: string; status: string; attempts: number }[],
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${String(options.count)}`,
  }),
}));
vi.mock('../../client/lib/itam/lifecycle.js', () => ({
  useLifecycleDescription: () => ({
    data: { name: 'disposals', stateInfo: [], transitions: [] },
  }),
  useRecordLifecycle: () => ({
    data: {
      state: 'pendingApproval',
      version: 2,
      available: [
        { name: 'approve', allowed: true, blockers: [] },
        { name: 'withdraw', allowed: false, blockers: [{ code: 'NOT_OWNER' }] },
      ],
      history: [
        { transition: '$create', from: null, to: 'draft' },
        { transition: 'submit', from: 'draft', to: 'pendingApproval' },
      ],
      effects: state.effects,
    },
  }),
}));
// React Flow and ELK lay out in a browser; here the props are what matters.
vi.mock('#components/lifecycle-diagram', () => ({
  LifecycleDiagram: (props: Record<string, unknown>) => {
    state.diagram = props;
    return <div role='img' aria-label={String(props.ariaLabel)} />;
  },
}));

it('draws where the record stands, the way it came and only the moves the reader may make', () => {
  render(
    <RecordFlow
      path='itam/disposals'
      id='d1'
      stateLabel={(name) => `state:${name}`}
      transitionLabel={(name) => `move:${name}`}
    />,
  );
  expect(screen.getByRole('img', { name: 'lifecycle.diagram' })).toBeTruthy();
  const props = state.diagram!;
  expect(props.currentState).toBe('pendingApproval');
  expect(props.availableTransitions).toEqual(['approve']);
  expect(props.history).toHaveLength(2);
  expect(props.direction).toBe('DOWN');
  expect(
    (props.stateLabel as (state: { name: string }) => string)({
      name: 'draft',
    }),
  ).toBe('state:draft');
  expect(
    (props.transitionLabel as (transition: { name: string }) => string)({
      name: 'submit',
    }),
  ).toBe('move:submit');
  // Every notification delivered: nothing to say.
  expect(screen.queryByText(/lifecycle\.undelivered/)).toBeNull();
});

it('says when a notification a move owed could not be delivered', () => {
  state.effects = [
    { effect: 'disposals.notifyApprover', status: 'dead', attempts: 5 },
    { effect: 'disposals.notifyDecision', status: 'succeeded', attempts: 1 },
  ];
  render(
    <RecordFlow
      path='itam/disposals'
      id='d1'
      stateLabel={(name) => name}
      transitionLabel={(name) => name}
    />,
  );
  expect(screen.getByText('lifecycle.undelivered:1')).toBeTruthy();
});
