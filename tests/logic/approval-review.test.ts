// @vitest-environment node
import { databaseManagerToken } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  agentRunServiceToken,
  type AgentRun,
} from '../../server/providers/itam/agent-runs.js';
import { approvalReviewerToken } from '../../server/providers/itam/approval-review.js';
import { approvalServiceToken } from '../../server/providers/itam/approvals.js';
import { agentRoutes } from '../../server/routes/itam/agents.js';
import { approvalRoutes } from '../../server/routes/itam/approvals.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { purchaseOrderRoutes } from '../../server/routes/itam/purchase-orders.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

// The model the review asks: its reply is the test's, and what it was asked
// is kept. There is no Agents plugin in the test harness.
const model = vi.hoisted(() => ({ reply: '', asked: [] as string[] }));
vi.mock('../../server/providers/itam/ai-model.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../server/providers/itam/ai-model.js')
  >()),
  openSession: async () => ({
    model: { modelService: 'test', model: 'reviewer' },
    ask: async (content: string) => {
      model.asked.push(content);
      return model.reply;
    },
    askJson: async () => null,
  }),
  readSkill: async () => '# 审批审阅',
}));

const REVIEW = {
  recommendation: 'conditional',
  summary: '库存有同型号，先用库存',
  asked: '3 × 13,998 = 41,994',
  reasons: ['库存有 2 台同型号'],
  alternatives: '先分配库存的 2 台',
  precedents: '没有先例',
  risks: [],
  missing: [],
  conditions: '只采购 1 台',
  comment: '库存有 2 台，先分配，再采购 1 台。',
};

const requester = { user: 'mia', role: 'manager' as const };
const approver = { user: 'ann', role: 'manager' as const };
const employee = { user: 'eve', role: 'employee' as const };

// 审批审阅: a purchase order sent for approval
// is reviewed for its approver alone, who decides from the review with the
// request's own `approve`; a decision elsewhere or a withdrawal retires it;
// the agent's switch stops automatic reviews but never a person asking.
describe('approval review', () => {
  let app: TestApp;
  let orderId: string;
  const call = (
    method: string,
    path: string,
    body: Record<string, unknown> | undefined,
    who: Record<string, string> | null,
  ) =>
    app.request(`/api/itam/${path}`, {
      ...(body ? json(body) : {}),
      method,
      ...(who ?? {}),
    });
  const data = async <T>(response: Response): Promise<T> =>
    ((await response.json()) as { data: T }).data;
  const created = async (path: string, body: Record<string, unknown>) => {
    const response = await call('POST', path, body, requester);
    if (response.status !== 201)
      throw new Error(`${path}: ${await response.text()}`);
    return (await data<{ id: string }>(response)).id;
  };
  const runs = () => app.container.resolve(agentRunServiceToken);
  const latest = () =>
    runs().latest('approvalReview', 'purchaseOrders', orderId);
  const settled = (status: AgentRun['status'] = 'pending') =>
    vi.waitFor(
      async () => {
        const run = await latest();
        expect(run?.status).toBe(status);
        return run!;
      },
      { timeout: 3000 },
    );
  const order = async () =>
    (await app.container
      .resolve(databaseManagerToken)
      .query()
      .selectFrom('purchaseOrders')
      .select(['status'])
      .where('id', '=', orderId)
      .executeTakeFirst()) as { status: string };
  const submit = () =>
    call(
      'POST',
      `purchase-orders/${orderId}/submit`,
      { approverId: 'ann' },
      requester,
    );

  beforeEach(async () => {
    model.reply = JSON.stringify(REVIEW);
    model.asked = [];
    app = await createTestApp({ seeds: true });
    for (const routes of [
      masterDataRoutes,
      purchaseOrderRoutes,
      approvalRoutes,
      agentRoutes,
    ])
      await app.mount(routes);
    // What the agents' provider wires at boot.
    const reviewer = app.container.resolve(approvalReviewerToken);
    const approvals = app.container.resolve(approvalServiceToken);
    approvals.onRequested = (approval) =>
      void reviewer
        .request({
          approvalId: String(approval.id),
          trigger: 'submitted',
          by: null,
        })
        .catch(() => undefined);
    approvals.onSettled = (approval) => void reviewer.settled(approval);

    const manufacturerId = await created('master/manufacturers', {
      name: 'Test Maker',
    });
    const categoryId = await created('master/categories', {
      name: 'Test Laptop',
      appliesTo: 'device',
    });
    const vendorId = await created('master/vendors', {
      name: 'Reseller',
      types: ['equipment'],
    });
    const modelId = await created('master/models', {
      name: 'Test Book 14',
      categoryId,
      manufacturerId,
    });
    orderId = await created('purchase-orders', { reason: 'newHire', vendorId });
    const lines = await call(
      'PUT',
      `purchase-orders/${orderId}/lines`,
      {
        lines: [
          { itemType: 'device', modelId, quantity: 3, unitPrice: 13_998 },
        ],
      },
      requester,
    );
    if (lines.status !== 200) throw new Error(await lines.text());
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('reviews an order sent for approval, for its approver alone', async () => {
    expect((await submit()).status).toBe(200);
    const run = await settled();
    expect(run).toMatchObject({
      trigger: 'submitted',
      startedById: null,
      deciderId: 'ann',
      model: 'test/reviewer',
    });
    // Read as the approver: the order and what was asked of it.
    expect(model.asked[0]).toContain('Test Book 14');

    const forApprover = await data<AgentRun>(
      await call(
        'GET',
        `agentRuns/latest?agent=approvalReview&subjectType=purchaseOrders&subjectId=${orderId}`,
        undefined,
        approver,
      ),
    );
    expect(forApprover.result).toMatchObject({
      recommendation: 'conditional',
      conditions: '只采购 1 台',
    });
    const forRequester = await data<AgentRun>(
      await call(
        'GET',
        `agentRuns/latest?agent=approvalReview&subjectType=purchaseOrders&subjectId=${orderId}`,
        undefined,
        requester,
      ),
    );
    expect(forRequester.result).toBeNull();

    const inbox = await data<{ open: AgentRun[] }>(
      await call('GET', 'inbox', undefined, approver),
    );
    expect(inbox.open.map((item) => item.id)).toEqual([run.id]);
    expect(inbox.open[0]!.title).toContain('PO-');
    expect(
      await data(await call('GET', 'inbox/count', undefined, approver)),
    ).toEqual({ waiting: 1 });
    expect(
      await data(await call('GET', 'inbox/count', undefined, requester)),
    ).toEqual({ waiting: 0 });
    expect((await call('GET', 'inbox', undefined, null)).status).toBe(401);
  });

  it('decides the order from the review, as its approver only', async () => {
    await submit();
    const run = await settled();
    const decide = (who: Record<string, string> | null) =>
      call(
        'POST',
        `agentRuns/${run.id}/decide`,
        { decision: 'approved', comment: '先用库存的 2 台' },
        who,
      );
    expect((await decide(null)).status).toBe(401);
    expect((await decide(employee)).status).toBe(403);
    const refused = await decide(requester);
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({ rule: 'NOT_APPROVER' });
    expect((await order()).status).toBe('pendingApproval');

    expect((await decide(approver)).status).toBe(200);
    expect((await order()).status).toBe('approved');
    expect(await runs().get(run.id)).toMatchObject({
      status: 'accepted',
      decision: 'approved',
      comment: '先用库存的 2 台',
      decidedById: 'ann',
    });
    const [approval] = await app.container
      .resolve(approvalServiceToken)
      .forSubject('purchaseOrder', orderId);
    expect(approval).toMatchObject({
      status: 'approved',
      comment: '先用库存的 2 台',
    });
    // Decided: not again.
    expect((await decide(approver)).status).toBe(422);
  });

  it('is retired when the order is decided on its page, or withdrawn', async () => {
    await submit();
    await settled();
    await call(
      'POST',
      `purchase-orders/${orderId}/decide`,
      { decision: 'rejected', comment: 'no' },
      approver,
    );
    await settled('superseded');

    await submit();
    await settled();
    await call('POST', `purchase-orders/${orderId}/withdraw`, {}, requester);
    await settled('superseded');
  });

  it('is set aside, leaving the order waiting on its approver', async () => {
    await submit();
    const run = await settled();
    expect(
      (await call('POST', `agentRuns/${run.id}/dismiss`, {}, requester)).status,
    ).toBe(422);
    expect(
      (await call('POST', `agentRuns/${run.id}/dismiss`, {}, approver)).status,
    ).toBe(200);
    expect((await runs().get(run.id))?.status).toBe('dismissed');
    expect((await order()).status).toBe('pendingApproval');
  });

  it('is redone in the approver’s words, the earlier one replaced', async () => {
    await submit();
    const first = await settled();
    const redo = await call(
      'POST',
      'agentRuns',
      {
        agent: 'approvalReview',
        subjectType: 'purchaseOrders',
        subjectId: orderId,
        revise: { runId: first.id, instruction: '预算够，全部采购' },
      },
      approver,
    );
    expect(redo.status).toBe(201);
    const second = await settled();
    expect(second.id).not.toBe(first.id);
    expect(second).toMatchObject({
      trigger: 'asked',
      startedById: 'ann',
      revisesId: first.id,
      instruction: '预算够，全部采购',
    });
    expect((await runs().get(first.id))?.status).toBe('superseded');
    expect(model.asked.at(-1)).toContain('预算够，全部采购');
  });

  it('runs on its own only while switched on; a person may always ask', async () => {
    const off = (who: Record<string, string>) =>
      call('PUT', 'agents/approvalReview/switches', { enabled: false }, who);
    expect((await off(employee)).status).toBe(403);
    expect((await off(requester)).status).toBe(200);
    await submit();
    // The request committed and its listener ran: still no review.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await latest()).toBeUndefined();

    const asked = await call(
      'POST',
      'agentRuns',
      {
        agent: 'approvalReview',
        subjectType: 'purchaseOrders',
        subjectId: orderId,
      },
      approver,
    );
    expect(asked.status).toBe(201);
    expect((await settled()).trigger).toBe('asked');
    // Only the approver asks.
    expect(
      (
        await call(
          'POST',
          'agentRuns',
          {
            agent: 'approvalReview',
            subjectType: 'purchaseOrders',
            subjectId: orderId,
          },
          requester,
        )
      ).status,
    ).toBe(422);

    const agents = await data<
      {
        agent: string;
        switches: { enabled: boolean };
        last7: { runs: number };
      }[]
    >(await call('GET', 'agents', undefined, approver));
    expect(agents[0]).toMatchObject({
      agent: 'approvalReview',
      switches: { enabled: false },
      last7: { runs: 1 },
    });
  });

  it('fails where its result would be when the reply cannot be read', async () => {
    model.reply = 'I think it is fine.';
    await submit();
    const run = await settled('failed');
    expect(run.failure).toBe('unreadable');
    // Asked once more before failing.
    expect(model.asked).toHaveLength(2);
    const inbox = await data<{ open: AgentRun[] }>(
      await call('GET', 'inbox', undefined, approver),
    );
    expect(inbox.open.map((item) => item.status)).toEqual(['failed']);
  });
});

describe('the approval-review eval set', () => {
  it('scores each case on its recommendation, asked as a real review asks', async () => {
    const { APPROVAL_REVIEW_EVALS } =
      await import('../../server/providers/itam/evals/approval-review.js');
    const { runEval } =
      await import('../../server/providers/itam/skill-evals.js');
    const prompts: string[] = [];
    // Every case answered as it expects, but the first.
    const report = await runEval({
      skill: 'approval-review',
      instructions: 'METHOD',
      open: async () => ({
        ask: async () => '',
        askJson: async (content: string) => {
          prompts.push(content);
          const item = APPROVAL_REVIEW_EVALS.find((candidate) =>
            content.includes(JSON.stringify(candidate.material, null, 2)),
          )!;
          const wrong = item === APPROVAL_REVIEW_EVALS[0];
          return {
            ...REVIEW,
            recommendation: wrong ? 'approve' : item.expect[0],
          } as never;
        },
      }),
    });
    expect(report.total).toBe(APPROVAL_REVIEW_EVALS.length);
    expect(report.passed).toBe(APPROVAL_REVIEW_EVALS.length - 1);
    expect(report.cases[0]).toMatchObject({ passed: false, got: ['approve'] });
    expect(prompts.every((prompt) => prompt.includes('METHOD'))).toBe(true);
  });
});
