// @vitest-environment node
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { databaseManagerToken } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  agentRunServiceToken,
  type AgentRun,
} from '../../server/providers/itam/agent-runs.js';
import type { ObservedDevice } from '../../server/providers/itam/device-sources.js';
import { deviceReviewServiceToken } from '../../server/providers/itam/device-review.js';
import { deviceSyncFollowUpToken } from '../../server/providers/itam/device-sync-followup.js';
import { deviceSyncServiceToken } from '../../server/providers/itam/device-sync.js';
import { planServiceToken } from '../../server/providers/itam/plans.js';
import { deviceSyncRoutes } from '../../server/routes/itam/device-sync.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

// The model the follow-up asks: it answers with the test's decisions, and
// what it was asked is kept. There is no Agents plugin in the test harness.
type Item = Record<string, unknown> & { ref: string; kind: string };
const model = vi.hoisted(() => ({
  asked: [] as string[],
  // The decision for each item the prompt lists; none means verify.
  decide: (() => null) as (item: Item) => Record<string, unknown> | null,
}));
vi.mock('../../server/providers/itam/ai-model.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../server/providers/itam/ai-model.js')
  >()),
  openSession: async () => ({
    model: { modelService: 'test', model: 'steward' },
    ask: async () => '',
    askJson: async (content: string) => {
      model.asked.push(content);
      const items = JSON.parse(
        /<items>\n(.*)\n<\/items>/s.exec(content)?.[1] ?? '[]',
      ) as Item[];
      return {
        decisions: items.map((item) => ({
          item: item.ref,
          action: 'verify',
          reason: 'test',
          ...model.decide(item),
        })),
      };
    },
  }),
  readSkill: async () => '# device-sync',
}));

const mia = { user: 'mia', role: 'manager' as const };

const observed = (
  externalId: string,
  overrides: Partial<ObservedDevice> = {},
): ObservedDevice => ({
  externalId,
  serialNo: null,
  deviceName: `PC-${externalId}`,
  manufacturer: 'Lenovo',
  model: 'ThinkPad T14 Gen 5',
  osName: 'Windows',
  osVersion: '10.0.22631',
  userPrincipal: null,
  userName: null,
  ownership: 'company',
  compliance: 'compliant',
  encrypted: true,
  wifiMac: null,
  enrolledAt: '2026-01-05T08:00:00Z',
  lastSyncAt: new Date().toISOString(),
  raw: { id: externalId },
  ...overrides,
});

async function* pagesOf(
  ...pages: readonly (readonly ObservedDevice[])[]
): AsyncIterable<readonly ObservedDevice[]> {
  for (const page of pages) yield page;
}

/**
 * MDM 跟进 (2026-10-17): after a pull, a platform user who is not the
 * holder goes to the device's 负责人 and a record the register lacks to the
 * asset managers, each as a plan waiting in 收件箱; a difference a person
 * carried out or set aside is not raised again.
 */
describe('MDM follow-up', () => {
  let app: TestApp;
  let laptop: string;
  let spare: string;
  let liNa: string;
  let wangWu: string;
  let managers: string[];
  const created = async (path: string, body: Record<string, unknown>) => {
    const response = await app.request(`/api/itam/${path}`, {
      ...json(body),
      ...mia,
    });
    if (response.status !== 201)
      throw new Error(`${path}: ${await response.text()}`);
    return ((await response.json()) as { data: { id: string } }).data.id;
  };
  const runs = () => app.container.resolve(agentRunServiceToken);
  const followUp = () => app.container.resolve(deviceSyncFollowUpToken);
  const plans = () => app.container.resolve(planServiceToken);
  const settled = (find: () => Promise<AgentRun | undefined>) =>
    vi.waitFor(
      async () => {
        const run = await find();
        expect(run?.status).toBe('pending');
        return run!;
      },
      { timeout: 3000 },
    );
  const latest = (subject: string) =>
    runs().latest('deviceSync', 'deviceSync', subject);
  beforeEach(async () => {
    model.asked = [];
    model.decide = () => null;
    managers = ['ann'];
    app = await createTestApp({ seeds: true });
    for (const routes of [masterDataRoutes, deviceRoutes, deviceSyncRoutes])
      await app.mount(routes);
    // The asset manager set's holders, as the authorization plugin lists them.
    Object.assign(app.container.resolve(authorizationToken), {
      permissionSets: {
        listAssignments: async () =>
          managers.map((id) => ({
            subject: { type: 'user', id },
            permissionSet: 'itam-asset-manager',
          })),
      },
    });
    const departmentId = await created('master/departments', {
      name: 'Test R&D',
    });
    liNa = await created('master/people', {
      name: 'Li Na',
      departmentId,
      email: 'li.na@example.com',
    });
    wangWu = await created('master/people', {
      name: 'Wang Wu',
      departmentId,
      email: 'wang.wu@example.com',
    });
    laptop = await created('devices', {
      modelId: 'model-thinkpad-t14-gen5',
      locationId: 'loc-hq',
      serialNo: 'SN-LAPTOP',
      ownerId: 'mia',
    });
    // In stock on the register, yet in use on the platform: 状态不符.
    spare = await created('devices', {
      modelId: 'model-thinkpad-t14-gen5',
      locationId: 'loc-hq',
      serialNo: 'SN-SPARE',
      ownerId: 'mia',
    });
    const assigned = await app.request(`/api/itam/devices/${laptop}/assign`, {
      ...json({ targetType: 'person', targetId: liNa }),
      ...mia,
    });
    if (assigned.status !== 200) throw new Error(await assigned.text());
    // The platform says Wang Wu uses the laptop, and knows a PC the
    // register does not.
    await app.container.resolve(deviceSyncServiceToken).ingest(
      'intune',
      pagesOf([
        observed('a', {
          serialNo: 'SN-LAPTOP',
          userPrincipal: 'wang.wu@example.com',
          userName: 'Wang Wu',
        }),
        observed('b', { serialNo: 'SN-SPARE' }),
        observed('x', { serialNo: 'SN-UNKNOWN' }),
      ]),
      'manual',
    );
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('proposes a plan to the 负责人 and to each asset manager, and carries it out', async () => {
    model.decide = (item) =>
      item.kind === 'userMismatch'
        ? { action: 'transfer', target: wangWu }
        : item.kind === 'unregistered'
          ? { action: 'ignore' }
          : null;
    const started = await followUp().afterSync(null);
    expect(started.map((run) => [run.subjectId, run.deciderId])).toEqual([
      ['owner:mia', 'mia'],
      ['shared:ann', 'ann'],
    ]);
    const mine = await settled(() => latest('owner:mia'));
    // Mia's run was asked about her laptop, not the record nobody owns.
    const asked = await vi.waitFor(() => {
      expect(model.asked).toHaveLength(2);
      return model.asked;
    });
    expect(asked.find((prompt) => prompt.includes('DE-000001'))).not.toContain(
      'SN-UNKNOWN',
    );
    const planId = String(mine.result?.planId);
    const plan = await plans().get('mia', planId);
    expect(plan.steps.map((step) => step.op)).toEqual(['transfer_device']);

    const done = await plans().execute('mia', planId, {
      revision: plan.revision,
    });
    expect(done.status).toBe('executed');
    await followUp().planDecided({ plan: done, decision: 'executed' });
    expect((await runs().get(mine.id))?.status).toBe('accepted');

    // Ann's is the record nobody owns, as one step to keep it off.
    const anns = await settled(() => latest('shared:ann'));
    const annPlan = await plans().get('ann', String(anns.result?.planId));
    expect(annPlan.steps.map((step) => step.op)).toEqual([
      'ignore_managed_device',
    ]);
  });

  // Left out when the plan was carried out, an item comes back with the
  // next follow-up (2026-10-22): nothing was done about it.
  it('raises again what was left out of a plan carried out', async () => {
    model.decide = (item) =>
      item.kind === 'userMismatch'
        ? { action: 'transfer', target: wangWu }
        : item.kind === 'statusMismatch'
          ? { action: 'keep' }
          : null;
    await followUp().afterSync(null);
    const mine = await settled(() => latest('owner:mia'));
    const plan = await plans().get('mia', String(mine.result?.planId));
    expect(plan.steps.map((step) => step.op).sort()).toEqual([
      'dismiss_device_difference',
      'transfer_device',
    ]);
    const keep = plan.steps.find(
      (step) => step.op === 'dismiss_device_difference',
    )!;
    const done = await plans().execute('mia', plan.id, {
      revision: plan.revision,
      skip: [keep.position],
    });
    await followUp().planDecided({ plan: done, decision: 'executed' });
    expect((await runs().get(mine.id))?.status).toBe('accepted');

    await followUp().afterSync(null);
    const next = await settled(() => latest('owner:mia'));
    expect(next.id).not.toBe(mine.id);
    expect(
      (next.result?.items as { kind: string; subject: string }[]).map(
        (item) => [item.kind, item.subject],
      ),
    ).toEqual([['statusMismatch', spare]]);
  });

  // Only what was carried out settles an item (2026-10-22): one set aside,
  // or only noted, is worked out again by the next follow-up.
  it('raises again what was set aside or only noted', async () => {
    await followUp().afterSync(null);
    const mine = await settled(() => latest('owner:mia'));
    // Nothing to carry out: a note each, no plan.
    expect(mine.result).toMatchObject({ planId: null });
    expect((mine.result?.notes as string[]).length).toBe(2);
    await followUp().dismiss(mine.id, 'mia');
    const anns = await settled(() => latest('shared:ann'));
    // Closed as settled (2026-10-21), it ends as handled, not set aside.
    const closed = await followUp().dismiss(anns.id, 'ann', { settled: true });
    expect(closed).toMatchObject({ status: 'accepted', decision: 'settled' });

    const again = await followUp().afterSync(null);
    expect(again.map((run) => run.subjectId)).toEqual([
      'owner:mia',
      'shared:ann',
    ]);
  });

  it('replaces a suggestion left waiting, and leaves the other asset managers’ copies to them', async () => {
    managers = ['ann', 'mia'];
    await followUp().afterSync(null);
    const first = await settled(() => latest('owner:mia'));
    await settled(() => latest('shared:mia'));
    // Her own and the shared one, each its entry in 收件箱.
    expect(await runs().waitingCount('mia')).toBe(2);
    // The next pull replaces what still waits.
    await followUp().afterSync(null);
    expect((await runs().get(first.id))?.status).toBe('superseded');

    // Declining is Ann's own (2026-10-22): Mia's copy still waits.
    const anns = await settled(() => latest('shared:ann'));
    await followUp().dismiss(anns.id, 'ann');
    expect((await latest('shared:mia'))?.status).toBe('pending');
    // Only its person sets it aside.
    const mine = await settled(() => latest('owner:mia'));
    await expect(followUp().dismiss(mine.id, 'ann')).rejects.toThrow();
  });

  // Carried out by one asset manager, the others' copies close as handled
  // once nothing on them is left to do (2026-10-22).
  it('closes the other asset managers’ copies once their steps are done', async () => {
    managers = ['ann', 'mia'];
    model.decide = (item) =>
      item.kind === 'unregistered' ? { action: 'ignore' } : null;
    await followUp().afterSync(null);
    const anns = await settled(() => latest('shared:ann'));
    await settled(() => latest('shared:mia'));
    const plan = await plans().get('ann', String(anns.result?.planId));
    const done = await plans().execute('ann', plan.id, {
      revision: plan.revision,
    });
    await followUp().planDecided({ plan: done, decision: 'executed' });
    expect(await latest('shared:mia')).toMatchObject({
      status: 'accepted',
      decision: 'settled',
    });
  });

  it('covers every kind: registers a record, and ignores a difference the register has right', async () => {
    model.decide = (item) =>
      item.kind === 'statusMismatch'
        ? { action: 'keep' }
        : item.kind === 'unregistered'
          ? { action: 'register', modelId: 'model-thinkpad-t14-gen5' }
          : null;
    // The record's user is a person on the register (2026-10-21): it is
    // registered and handed to them in one step.
    await app.container
      .resolve(databaseManagerToken)
      .query()
      .updateTable('managedDevices')
      .set({ personId: liNa })
      .where('externalId', '=', 'x')
      .execute();
    // Kept where she sits, said in the step (2026-10-22).
    await app.container
      .resolve(databaseManagerToken)
      .query()
      .updateTable('people')
      .set({ locationId: 'loc-hq' })
      .where('id', '=', liNa)
      .execute();
    await followUp().afterSync(null);
    const mine = await settled(() => latest('owner:mia'));
    const minePlan = await plans().get('mia', String(mine.result?.planId));
    expect(minePlan.steps.map((step) => step.op)).toEqual([
      'dismiss_device_difference',
    ]);
    // Each item's suggestion, for its row on MDM 核对 (2026-10-21).
    expect(mine.result?.advice).toContainEqual(
      expect.objectContaining({
        subject: spare,
        kind: 'statusMismatch',
        action: 'keep',
        planned: true,
        steps: [1],
      }),
    );
    expect(
      (
        await plans().execute('mia', minePlan.id, {
          revision: minePlan.revision,
        })
      ).status,
    ).toBe('executed');
    const review = app.container.resolve(deviceReviewServiceToken);
    expect(
      (await review.checks()).some(
        (check) => check.deviceId === spare && check.kind === 'statusMismatch',
      ),
    ).toBe(false);

    const anns = await settled(() => latest('shared:ann'));
    const annPlan = await plans().get('ann', String(anns.result?.planId));
    expect(annPlan.steps.map((step) => step.op)).toEqual(['create_record']);
    // Not settled while its record is still listed (2026-10-22): a page
    // with stale lists closed a new import's follow-up the moment it came.
    await expect(
      followUp().dismiss(anns.id, 'ann', { settled: true }),
    ).rejects.toThrow('still to be settled');
    expect(annPlan.steps[0].check?.fields).toContainEqual(
      expect.objectContaining({ field: 'input' }),
    );
    const hq = await app.container
      .resolve(databaseManagerToken)
      .query()
      .selectFrom('locations')
      .select('name')
      .where('id', '=', 'loc-hq')
      .executeTakeFirstOrThrow<{ name: string }>();
    expect(annPlan.steps[0].check?.title).toContain(hq.name);
    expect(
      (await plans().execute('ann', annPlan.id, { revision: annPlan.revision }))
        .status,
    ).toBe('executed');
    const registered = await app.container
      .resolve(databaseManagerToken)
      .query()
      .selectFrom('devices')
      .select(['locationId', 'status', 'assigneeId'])
      .where('serialNo', '=', 'SN-UNKNOWN')
      .executeTakeFirst<{
        locationId: unknown;
        status: unknown;
        assigneeId: unknown;
      }>();
    expect(registered).toMatchObject({
      status: 'inUse',
      assigneeId: liNa,
    });
  });

  // MDM 跟进 on MDM 核对 (2026-10-17).
  it('works out the reader’s own items when they ask, switched on or not', async () => {
    const ask = (who?: { user: string; role: 'employee' | 'manager' }) =>
      app.request('/api/itam/device-sync/followUp', {
        ...json({}),
        ...who,
      });
    expect((await ask()).status).toBe(401);
    expect((await ask({ user: 'bob', role: 'employee' })).status).toBe(403);
    await app.container
      .resolve(databaseManagerToken)
      .query()
      .insertInto('itamSettings')
      .values({
        key: 'agent-switches',
        value: JSON.stringify({ deviceSync: { enabled: false } }),
        updatedAt: new Date(),
      })
      .execute();

    // Mia answers for the devices and holds no asset manager set.
    const asked = await ask(mia);
    expect(asked.status).toBe(200);
    const started = ((await asked.json()) as { data: AgentRun[] }).data;
    expect(
      started.map((run) => [run.subjectId, run.trigger, run.startedById]),
    ).toEqual([['owner:mia', 'asked', 'mia']]);
    const mine = await settled(() => latest('owner:mia'));
    expect((mine.result?.items as unknown[]).length).toBeGreaterThan(0);

    // Ann, an asset manager, gets the records nobody owns; Mia's stays.
    // Zoe, the other asset manager, gets them again too (2026-10-22).
    managers = ['ann', 'zoe'];
    const anns = (
      (await (await ask({ user: 'ann', role: 'manager' })).json()) as {
        data: AgentRun[];
      }
    ).data;
    expect(anns.map((run) => run.subjectId)).toEqual(['shared:ann']);
    // One part alone (2026-10-22): asking for her own devices only.
    expect(
      (await followUp().ask('ann', 'own')).map((run) => run.subjectId),
    ).toEqual([]);
    expect(await latest('shared:zoe')).toMatchObject({
      trigger: 'asked',
      startedById: 'ann',
      deciderId: 'zoe',
    });
    expect((await runs().get(mine.id))?.status).toBe('pending');

    // Set aside, a pull raises it no more, but asking again does
    // (2026-10-22): declining a suggestion leaves the difference.
    await followUp().dismiss(mine.id, 'mia');
    expect(
      (await followUp().afterSync(null)).map((run) => run.subjectId),
    ).not.toContain('owner:mia');
    expect(
      ((await (await ask(mia)).json()) as { data: AgentRun[] }).data.map(
        (run) => run.subjectId,
      ),
    ).toEqual(['owner:mia']);
  });

  // For an asset manager on MDM 核对 (2026-10-17).
  it('shows an asset manager the other people’s open follow-ups to read, and nobody else', async () => {
    model.decide = (item) =>
      item.kind === 'userMismatch'
        ? { action: 'transfer', target: wangWu }
        : null;
    await followUp().afterSync(null);
    await settled(() => latest('owner:mia'));
    await settled(() => latest('shared:ann'));
    const read = async (who?: { user: string; role: 'manager' | 'employee' }) =>
      app.request('/api/itam/device-sync/followUps', { ...who });
    expect((await read()).status).toBe(401);
    expect((await read({ user: 'bob', role: 'employee' })).status).toBe(403);
    const anns = (await (
      await read({ user: 'ann', role: 'manager' })
    ).json()) as {
      data: Record<string, unknown>[];
    };
    // Mia's devices, with what the plan would do; not Ann's own.
    expect(anns.data).toHaveLength(1);
    expect(anns.data[0]).toMatchObject({ deciderId: 'mia', status: 'pending' });
    expect((anns.data[0]!.steps as string[]).length).toBe(1);
    // Mia holds no asset manager set.
    expect(
      ((await (await read(mia)).json()) as { data: unknown[] }).data,
    ).toEqual([]);
  });

  it('runs only while switched on', async () => {
    await app.container
      .resolve(databaseManagerToken)
      .query()
      .insertInto('itamSettings')
      .values({
        key: 'agent-switches',
        value: JSON.stringify({ deviceSync: { enabled: false } }),
        updatedAt: new Date(),
      })
      .execute();
    expect(await followUp().afterSync(null)).toEqual([]);
  });
});
