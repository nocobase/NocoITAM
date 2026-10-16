// @vitest-environment node
import { databaseManagerToken } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  agentRunServiceToken,
  type AgentRun,
} from '../../server/providers/itam/agent-runs.js';
import { addDays, today } from '../../server/providers/itam/dates.js';
import { renewalReviewerToken } from '../../server/providers/itam/renewal-review.js';
import { agentRoutes } from '../../server/routes/itam/agents.js';
import { entitlementRoutes } from '../../server/routes/itam/entitlements.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

// The model the agent asks: the reply is the test's, and what it was asked
// is kept. There is no Agents plugin in the test harness.
const model = vi.hoisted(() => ({ reply: '', asked: [] as string[] }));
vi.mock('../../server/providers/itam/ai-model.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../server/providers/itam/ai-model.js')
  >()),
  openSession: async () => ({
    model: { modelService: 'test', model: 'suggester' },
    ask: async (content: string) => {
      model.asked.push(content);
      return model.reply;
    },
    askJson: async () => null,
  }),
  readSkill: async () => '# skill',
}));

const mia = { user: 'mia', role: 'manager' as const };
const ann = { user: 'ann', role: 'manager' as const };

interface SuggestionRun extends AgentRun {
  readonly result: {
    readonly changes: readonly {
      readonly op: string;
      readonly action: string;
      readonly quantity?: number | null;
    }[];
  } | null;
}

/**
 * 授权续费 (plan "Work agents", step 2): it only suggests. An entitlement
 * due soon is reviewed for its 负责人. Accepting carries out the changes
 * kept as a plan, as the decider, and the run names it.
 */
describe('a work agent that suggests', () => {
  let app: TestApp;
  let personId: string;
  let productId: string;
  type Who = typeof mia;
  const call = (
    method: string,
    path: string,
    body: Record<string, unknown> | undefined,
    who: Who,
  ) =>
    app.request(`/api/itam/${path}`, {
      ...(body ? json(body) : {}),
      method,
      ...who,
    });
  const data = async <T>(response: Response): Promise<T> =>
    ((await response.json()) as { data: T }).data;
  const created = async (path: string, body: Record<string, unknown>) => {
    const response = await call('POST', path, body, mia);
    if (response.status !== 201)
      throw new Error(`${path}: ${await response.text()}`);
    return (await data<{ id: string }>(response)).id;
  };
  const runs = () => app.container.resolve(agentRunServiceToken);
  const settled = (
    find: () => Promise<AgentRun | null>,
    status: AgentRun['status'] = 'pending',
  ) =>
    vi.waitFor(
      async () => {
        const run = await find();
        expect(run?.status).toBe(status);
        return run as SuggestionRun;
      },
      { timeout: 3000 },
    );
  const row = async (table: string, id: string) =>
    (await app.container
      .resolve(databaseManagerToken)
      .query()
      .selectFrom(table)
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()) as Record<string, unknown>;
  beforeEach(async () => {
    model.asked = [];
    model.reply = JSON.stringify({
      recommendation: 'renew',
      summary: '照常续费',
    });
    app = await createTestApp({ seeds: true });
    for (const routes of [masterDataRoutes, entitlementRoutes, agentRoutes])
      await app.mount(routes);
    const departmentId = await created('master/departments', { name: 'R&D' });
    personId = await created('master/people', { name: 'Li Na', departmentId });
    const softwareCategoryId = await created('master/categories', {
      name: 'Test Design',
      appliesTo: 'entitlement',
    });
    productId = await created('master/softwareProducts', {
      name: 'Test Figma',
      categoryId: softwareCategoryId,
      deliveryMethod: 'saas',
    });
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('suggests fewer seats before a renewal, and reclaims a leaver’s', async () => {
    const entitlementId = await created('entitlements', {
      kind: 'subscription',
      softwareProductId: productId,
      name: 'Test Figma Team',
      licensingModel: 'perUser',
      billingModel: 'perSeat',
      billingCycle: 'year',
      unitPrice: 1200,
      seatCount: 5,
      expiryDate: addDays(today(), 20),
      autoRenew: true,
      ownerId: 'mia',
    });
    const stayerId = await created('master/people', {
      name: 'Wang Wu',
      departmentId: String((await row('people', personId)).departmentId),
    });
    for (const holderId of [personId, stayerId]) {
      const assigned = await call(
        'POST',
        `entitlements/${entitlementId}/assign-seats`,
        { seats: [{ holderId, account: `${holderId}@example.com` }] },
        mia,
      );
      if (assigned.status !== 200) throw new Error(await assigned.text());
    }
    const seats = await data<{ seats: { id: string; holderId: string }[] }>(
      await call('GET', `entitlements/${entitlementId}/seats`, undefined, mia),
    );
    const leaverSeat = seats.seats.find((seat) => seat.holderId === personId)!;
    await app.container
      .resolve(databaseManagerToken)
      .query()
      .updateTable('people')
      .set({ employmentStatus: 'left' })
      .where('id', '=', personId)
      .execute();
    model.reply = JSON.stringify({
      recommendation: 'reduce',
      summary: '离职 1 人，减到 2 个席位',
      seatCount: 2,
      reclaimSeatIds: [leaverSeat.id],
      saving: '3 × 1,200 = 3,600 元/年',
    });

    const renewals = app.container.resolve(renewalReviewerToken);
    expect(await renewals.dailyPass()).toBe(1);
    const run = await settled(() =>
      runs().latest('renewalReview', 'entitlements', entitlementId),
    );
    expect(run.deciderId).toBe('mia');
    // The seats and who holds them were read, the leaver marked.
    expect(model.asked.at(-1)).toContain('Li Na');
    expect(run.result?.changes).toEqual([
      expect.objectContaining({ op: 'reclaim_seats', action: 'reclaim' }),
      expect.objectContaining({
        op: 'adjust_entitlement_seats',
        action: 'adjustSeats',
        quantity: 2,
      }),
    ]);
    // Reviewed once a month at most.
    expect(await renewals.dailyPass()).toBe(0);

    // Only the 负责人 asks for one by hand.
    expect(
      (
        await call(
          'POST',
          'agentRuns',
          {
            agent: 'renewalReview',
            subjectType: 'entitlements',
            subjectId: entitlementId,
          },
          ann,
        )
      ).status,
    ).toBe(422);

    // Only its decider accepts it.
    expect(
      (await call('POST', `agentRuns/${run.id}/accept`, { keep: [0, 1] }, ann))
        .status,
    ).toBe(422);
    const accepted = await data<{
      run: AgentRun & { planId: string };
      plan: { status: string; steps: { status: string }[] };
    }>(await call('POST', `agentRuns/${run.id}/accept`, { keep: [0, 1] }, mia));
    expect(accepted.run.status).toBe('accepted');
    expect(accepted.plan).toMatchObject({
      status: 'executed',
      steps: [{ status: 'done' }, { status: 'done' }],
    });
    // The plan it became, for its decider alone.
    const plan = await data<{ id: string } | null>(
      await call('GET', `agentRuns/${run.id}/plan`, undefined, mia),
    );
    expect(plan?.id).toBe(accepted.run.planId);
    expect(
      await data(await call('GET', `agentRuns/${run.id}/plan`, undefined, ann)),
    ).toBeNull();
    expect(await row('entitlements', entitlementId)).toMatchObject({
      seatCount: 2,
    });
    expect(await row('entitlementSeats', leaverSeat.id)).toMatchObject({
      releasedAt: expect.anything(),
    });
  });

  it('turns auto-renewal off for one let lapse, and agrees to one that changes nothing', async () => {
    const entitlementId = await created('entitlements', {
      kind: 'subscription',
      softwareProductId: productId,
      name: 'Test Figma Team',
      licensingModel: 'perUser',
      billingModel: 'perSeat',
      billingCycle: 'year',
      unitPrice: 1200,
      seatCount: 5,
      expiryDate: addDays(today(), 20),
      autoRenew: true,
      ownerId: 'mia',
    });
    // A reply that cannot be read fails the run, which waits in the
    // inbox until a newer run replaces it.
    model.reply = 'not json';
    const ask = () =>
      call(
        'POST',
        'agentRuns',
        {
          agent: 'renewalReview',
          subjectType: 'entitlements',
          subjectId: entitlementId,
        },
        mia,
      );
    await ask();
    const failed = await settled(
      () => runs().latest('renewalReview', 'entitlements', entitlementId),
      'failed',
    );
    model.reply = JSON.stringify({
      recommendation: 'lapse',
      summary: '没人在用，不再续费',
    });
    const asked = await call(
      'POST',
      'agentRuns',
      {
        agent: 'renewalReview',
        subjectType: 'entitlements',
        subjectId: entitlementId,
      },
      mia,
    );
    expect(asked.status).toBe(201);
    const lapsing = await settled(() =>
      runs().latest('renewalReview', 'entitlements', entitlementId),
    );
    expect((await runs().get(failed.id))?.status).toBe('superseded');
    expect(lapsing.result?.changes).toEqual([
      expect.objectContaining({
        op: 'set_entitlement_auto_renew',
        action: 'stopAutoRenew',
      }),
    ]);
    await call('POST', `agentRuns/${lapsing.id}/accept`, { keep: [0] }, mia);
    expect(await row('entitlements', entitlementId)).toMatchObject({
      autoRenew: false,
    });

    // Asked again: renewing as it is would turn auto-renewal back on; Mia
    // keeps none of it, which is refused, and then agrees to a plain renew.
    model.reply = JSON.stringify({
      recommendation: 'renew',
      summary: '照常续费',
    });
    await call(
      'POST',
      'agentRuns',
      {
        agent: 'renewalReview',
        subjectType: 'entitlements',
        subjectId: entitlementId,
      },
      mia,
    );
    const renewing = await settled(() =>
      runs().latest('renewalReview', 'entitlements', entitlementId),
    );
    expect(renewing.result?.changes).toEqual([
      expect.objectContaining({ action: 'startAutoRenew' }),
    ]);
    expect(
      (await call('POST', `agentRuns/${renewing.id}/accept`, { keep: [] }, mia))
        .status,
    ).toBe(422);
    expect(
      (await call('POST', `agentRuns/${renewing.id}/dismiss`, {}, mia)).status,
    ).toBe(200);

    // A perpetual licence's maintenance renewed as it is: nothing to
    // change, so accepting is agreeing, with no plan.
    const perpetualId = await created('entitlements', {
      kind: 'perpetual',
      softwareProductId: productId,
      name: 'Test Figma Desktop',
      licensingModel: 'perUser',
      seatCount: 2,
      maintenanceExpiryDate: addDays(today(), 10),
      ownerId: 'mia',
    });
    await call(
      'POST',
      'agentRuns',
      {
        agent: 'renewalReview',
        subjectType: 'entitlements',
        subjectId: perpetualId,
      },
      mia,
    );
    const plain = await settled(() =>
      runs().latest('renewalReview', 'entitlements', perpetualId),
    );
    expect(plain.result?.changes).toEqual([]);
    const agreed = await data<{ run: AgentRun; plan: unknown }>(
      await call('POST', `agentRuns/${plain.id}/accept`, { keep: [] }, mia),
    );
    expect(agreed).toMatchObject({ run: { status: 'accepted' }, plan: null });
  });
});

describe('the renewal-review eval set', () => {
  it('scores each renewal on its recommendation, asked as a real review asks', async () => {
    const { RENEWAL_REVIEW_EVALS } =
      await import('../../server/providers/itam/evals/renewal-review.js');
    const { runEval } =
      await import('../../server/providers/itam/skill-evals.js');
    const prompts: string[] = [];
    // Every case answered as it expects, but the first.
    const report = await runEval({
      skill: 'renewal-review',
      instructions: 'METHOD',
      open: async () => ({
        ask: async () => '',
        askJson: async (content: string) => {
          prompts.push(content);
          const item = RENEWAL_REVIEW_EVALS.find((candidate) =>
            content.includes(
              JSON.stringify(candidate.material.entitlement, null, 2),
            ),
          )!;
          const wrong = item === RENEWAL_REVIEW_EVALS[0];
          return {
            recommendation: wrong ? 'lapse' : item.expect[0],
            summary: '',
          } as never;
        },
      }),
    });
    expect(report.total).toBe(RENEWAL_REVIEW_EVALS.length);
    expect(report.passed).toBe(RENEWAL_REVIEW_EVALS.length - 1);
    expect(report.cases[0]).toMatchObject({ passed: false, got: ['lapse'] });
    expect(prompts.every((prompt) => prompt.includes('METHOD'))).toBe(true);
  });
});
