import {
  AuthenticationProvider,
  authenticationClientToken,
} from '@nocobase/app-plugin-authentication/client';
import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { expect, it, vi } from 'vitest';

import {
  ApprovalReviewBlock,
  ApprovalReviewCard,
} from '../../client/components/itam/ai/approval-review.js';
import type { ApprovalReviewRun } from '../../client/lib/itam/agents.js';
import { purchaseOrderDomain } from '../../client/pages/itam/procurement/po-domain.js';
import enUS from '../../client/locales/en-US.js';

const refusal = 'This is a demo. Changes cannot be saved.';
const failure = 'The value is invalid.';
const run: ApprovalReviewRun = {
  id: 'review-1',
  agent: 'approvalReview',
  trigger: 'submitted',
  startedById: null,
  subjectType: 'purchaseOrders',
  subjectId: 'po-1',
  refId: 'approval-1',
  deciderId: 'reader',
  status: 'pending',
  result: {
    recommendation: 'approve',
    summary: 'Approve the request',
    asked: 'One laptop',
    reasons: [],
    alternatives: null,
    precedents: 'None',
    risks: [],
    missing: [],
    conditions: null,
    comment: 'Original comment',
  },
  failure: null,
  revisesId: null,
  instruction: null,
  decision: null,
  comment: null,
  decidedById: null,
  decidedAt: null,
  model: null,
  createdAt: '2026-10-25T00:00:00Z',
  updatedAt: '2026-10-25T00:00:00Z',
  title: 'PO-000069',
};

async function renderApproval(
  element: ReactElement,
  path: string,
  demo: boolean,
) {
  const write = vi.fn(() =>
    Response.json(
      {
        error: {
          reason: demo ? 'DEMO_READ_ONLY' : 'VALIDATION_ERROR',
          message: demo ? refusal : failure,
        },
      },
      { status: 400 },
    ),
  );
  await renderWithApp(
    <AuthenticationProvider>
      <QueryClientProvider client={new QueryClient()}>
        {element}
      </QueryClientProvider>
    </AuthenticationProvider>,
    {
      namespace: 'itam',
      namespaces: { itam: enUS },
      services: (app) => {
        app.container.instance(authenticationClientToken, {
          getSession: async () => ({
            data: { user: { id: 'reader' }, session: { id: 'session-1' } },
          }),
        });
      },
      fetch: answerApi((call) => {
        if (call.method === 'POST' && call.path === path) return write();
        if (call.path === 'itam/settings/permissions')
          return { data: { approve: true } };
        if (call.path === 'itam/purchase-orders/po-1/lines')
          return { data: [] };
        if (call.path === 'itam/purchase-orders/po-1/approvals')
          return { data: [{ status: 'pending', approverIds: ['reader'] }] };
        if (call.path === 'itam/agentRuns/latest') return { data: null };
        return new Response(null, { status: 404 });
      }),
    },
  );
  return write;
}

it.each([true, false])(
  'retains ordinary purchase decision errors after closing the form (demo=%s)',
  async (demo) => {
    const Actions = purchaseOrderDomain.Actions!;
    const write = await renderApproval(
      <Actions record={{ id: 'po-1', status: 'pendingApproval' }} />,
      'itam/purchase-orders/po-1/decide',
      demo,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: enUS.procurement.decide }),
    );
    const dialog = screen.getByRole('dialog');
    const approve = within(dialog).getByRole('button', {
      name: enUS.procurement.approve,
    });
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: 'Keep this draft' },
    });
    fireEvent.click(approve);
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(approve).toBeEnabled());
    expect(screen.getByDisplayValue('Keep this draft')).toBeVisible();
    if (demo) expect(screen.queryByText(refusal)).toBeNull();
    else expect(screen.getByText(failure)).toBeVisible();
    fireEvent.click(
      within(dialog).getByRole('button', { name: enUS.actions.cancel }),
    );
    if (demo) expect(screen.queryByText(refusal)).toBeNull();
    else expect(screen.getByText(failure)).toBeVisible();
    expect(
      screen.getByRole('button', { name: enUS.procurement.decide }),
    ).toBeEnabled();
  },
);

it.each(
  (['decide', 'dismiss', 'revise', 'ask'] as const).flatMap((action) =>
    [true, false].map((demo) => ({ action, demo })),
  ),
)(
  'keeps approval assistant drafts without duplicate Demo errors ($action, demo=$demo)',
  async ({ action, demo }) => {
    const onDecided = vi.fn();
    const write = await renderApproval(
      action === 'ask' ? (
        <ApprovalReviewBlock
          subjectType='purchaseOrders'
          subjectId='po-1'
          waitingOnReader
        />
      ) : (
        <ApprovalReviewCard run={run} onDecided={onDecided} />
      ),
      action === 'ask' || action === 'revise'
        ? 'itam/agentRuns'
        : `itam/agentRuns/review-1/${action}`,
      demo,
    );
    if (action !== 'ask') {
      fireEvent.change(screen.getByDisplayValue('Original comment'), {
        target: { value: 'Keep this comment' },
      });
    }
    if (action === 'revise') {
      fireEvent.click(screen.getByRole('button', { name: enUS.review.redo }));
      fireEvent.change(
        screen.getByPlaceholderText(enUS.review.redoPlaceholder),
        { target: { value: 'Check the budget' } },
      );
    }
    const label = {
      decide: enUS.review.approve,
      dismiss: enUS.review.dismiss,
      revise: enUS.review.redoSend,
      ask: enUS.review.ask,
    }[action];
    const button = await screen.findByRole('button', { name: label });
    fireEvent.click(button);
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(button).toBeEnabled());
    if (demo) expect(screen.queryByText(refusal)).toBeNull();
    else expect(screen.getByText(failure)).toBeVisible();
    if (action !== 'ask')
      expect(screen.getByDisplayValue('Keep this comment')).toBeVisible();
    if (action === 'revise')
      expect(screen.getByDisplayValue('Check the budget')).toBeVisible();
    expect(onDecided).not.toHaveBeenCalled();
  },
);
