// @vitest-environment node
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { databaseManagerToken } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentRunServiceToken } from '../../server/providers/itam/agent-runs.js';
import { approvalServiceToken } from '../../server/providers/itam/approvals.js';
import { deviceSyncServiceToken } from '../../server/providers/itam/device-sync.js';
import type { OperationContext } from '../../server/providers/itam/devices.js';
import type { Row } from '../../server/providers/itam/collection-query.js';
import { dataRoutes } from '../../server/routes/itam/data.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { entitlementRoutes } from '../../server/routes/itam/entitlements.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { purchaseOrderRoutes } from '../../server/routes/itam/purchase-orders.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

// No model may be asked while the demo is imported.
const model = vi.hoisted(() => ({ opened: 0 }));
vi.mock('../../server/providers/itam/ai-model.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../server/providers/itam/ai-model.js')
  >()),
  openSession: async () => {
    model.opened += 1;
    return null;
  },
}));

const manager = { user: 'mia', role: 'manager' as const };

/**
 * The work agents' suggestions the demo comes with (2026-10-16): written
 * from the records, never asked of a model, and cleared with the demo.
 */
describe('the demo’s AI suggestions', () => {
  let app: TestApp;
  const rows = (table: string) =>
    app.container
      .resolve(databaseManagerToken)
      .query()
      .selectFrom(table)
      .selectAll()
      .execute<Row>();
  const result = (row: Row) =>
    (typeof row.result === 'string'
      ? JSON.parse(row.result)
      : row.result) as Record<string, unknown>;
  const generate = async (language: string) => {
    await app.request('/api/itam/demo/generate', {
      ...json({ language }),
      ...manager,
    });
    for (;;) {
      const status = (await (
        await app.request('/api/itam/demo', manager)
      ).json()) as {
        data: { importing: unknown; failure: { message: string } | null };
      };
      if (status.data.failure) throw new Error(status.data.failure.message);
      if (!status.data.importing) return;
      await new Promise((done) => setTimeout(done, 20));
    }
  };

  beforeEach(async () => {
    model.opened = 0;
    app = await createTestApp({ seeds: true });
    for (const routes of [
      masterDataRoutes,
      deviceRoutes,
      entitlementRoutes,
      purchaseOrderRoutes,
      dataRoutes,
    ])
      await app.mount(routes);
    // The asset manager set's holders, as the authorization plugin lists them.
    Object.assign(app.container.resolve(authorizationToken), {
      permissionSets: {
        listAssignments: async () => [
          {
            subject: { type: 'user', id: 'mia' },
            permissionSet: 'itam-asset-manager',
          },
        ],
        list: async () => [],
      },
    });
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('writes a review per waiting request, the MDM follow-up and the joiners’ picks, without a model', async () => {
    // What the agents' provider is told: every request and pull is the
    // demo's, which starts no agent.
    const requested: OperationContext[] = [];
    const pulled: Row[] = [];
    app.container.resolve(approvalServiceToken).onRequested = (_, context) =>
      requested.push(context);
    app.container.resolve(deviceSyncServiceToken).onSynced = (run) =>
      pulled.push(run);

    await generate('zh-CN');
    expect(model.opened).toBe(0);
    expect(requested.length).toBeGreaterThan(0);
    expect(requested.every((context) => context.sourceType === 'demo')).toBe(
      true,
    );
    expect(pulled.every((run) => run.trigger === 'demo')).toBe(true);

    const runs = await rows('itamAgentRuns');
    const reviews = runs.filter((run) => run.agent === 'approvalReview');
    const pending = (await rows('approvals')).filter(
      (approval) => approval.status === 'pending',
    );
    expect(reviews.map((run) => run.refId).sort()).toEqual(
      pending.map((approval) => approval.id).sort(),
    );
    expect(reviews.every((run) => run.status === 'pending')).toBe(true);
    expect(reviews.map((run) => result(run).recommendation).sort()).toEqual([
      'conditional',
      'conditional',
      'needMore',
      'reject',
    ]);
    // Written from the records: the monitors in stock, by tag.
    expect(
      reviews.some((run) => String(result(run).comment).includes('SH-MON-006')),
    ).toBe(true);

    // The follow-up covers MDM 核对, in the demo's language, its plans
    // waiting as long as the demo is looked at.
    const followUps = runs.filter((run) => run.agent === 'deviceSync');
    expect(followUps.length).toBeGreaterThan(0);
    expect(followUps.every((run) => run.status === 'pending')).toBe(true);
    const items = followUps.flatMap(
      (run) => result(run).items as { kind: string }[],
    );
    expect(new Set(items.map((item) => item.kind))).toEqual(
      new Set([
        'stale',
        'userMismatch',
        'statusMismatch',
        'unmanaged',
        'unregistered',
      ]),
    );
    expect(String(result(followUps[0]!).summary)).toMatch(/处差异/);
    const plans = await rows('itamPlans');
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans)
      expect(new Date(String(plan.expiresAt)).getTime()).toBeGreaterThan(
        Date.now() + 20 * 86_400_000,
      );

    const advice = await rows('onboardingRuns');
    expect(advice.map((run) => [run.trigger, run.status])).toEqual([
      ['demo', 'ready'],
      ['demo', 'ready'],
    ]);
    // The laptop repaired twice is passed over.
    expect(
      advice.every((run) => String(run.summary).includes('SH-LT-050')),
    ).toBe(true);
  }, 120_000);

  it('clears them with the demo, and any run about records that are gone', async () => {
    await generate('en-US');
    expect((await rows('itamAgentRuns')).length).toBeGreaterThan(0);
    // Left by an import before the demo tracked its runs: a review of a
    // request and a follow-up on a device that are gone, and a failure.
    const runs = app.container.resolve(agentRunServiceToken);
    const stray = async (
      agent: 'approvalReview' | 'deviceSync',
      subjectId: string,
      result: Record<string, unknown> | null,
    ) => {
      const run = await runs.start({
        agent,
        trigger: agent === 'deviceSync' ? 'synced' : 'submitted',
        startedById: null,
        subjectType: agent === 'deviceSync' ? 'deviceSync' : 'purchaseOrders',
        subjectId,
        deciderId: 'mia',
      });
      await runs.finish(
        run.id,
        result
          ? { status: 'pending', result }
          : { status: 'failed', failure: 'unavailable' },
      );
    };
    await stray('approvalReview', 'po-gone', null);
    await stray('deviceSync', 'owner:mia', {
      items: [{ key: 'x', kind: 'stale', subject: 'device-gone', label: 'x' }],
      planId: null,
      notes: [],
      summary: '',
    });
    await stray('deviceSync', 'shared:mia', null);
    expect(
      (await app.request('/api/itam/demo/clear', { ...json({}), ...manager }))
        .status,
    ).toBe(200);
    expect(await rows('itamAgentRuns')).toEqual([]);
    expect(await rows('itamPlans')).toEqual([]);
    expect(await rows('onboardingRuns')).toEqual([]);
  }, 120_000);
});
