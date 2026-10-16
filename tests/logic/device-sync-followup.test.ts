// @vitest-environment node
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { databaseManagerToken } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  agentRunServiceToken,
  type AgentRun,
} from '../../server/providers/itam/agent-runs.js';
import type { ObservedDevice } from '../../server/providers/itam/device-sources.js';
import { deviceSyncFollowUpToken } from '../../server/providers/itam/device-sync-followup.js';
import { deviceSyncServiceToken } from '../../server/providers/itam/device-sync.js';
import { planServiceToken } from '../../server/providers/itam/plans.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

// The model the follow-up asks: it answers with the test's decisions, and
// what it was asked is kept. There is no Agents plugin in the test harness.
const model = vi.hoisted(() => ({
  asked: [] as string[],
  decisions: [] as { subject: string; action: string; target?: string }[],
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
      return { decisions: model.decisions };
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
  const record = async (externalId: string) =>
    String(
      (
        (await app.container
          .resolve(databaseManagerToken)
          .query()
          .selectFrom('managedDevices')
          .select(['id'])
          .where('externalId', '=', externalId)
          .executeTakeFirst()) as { id: unknown }
      ).id,
    );

  beforeEach(async () => {
    model.asked = [];
    model.decisions = [];
    managers = ['ann'];
    app = await createTestApp({ seeds: true });
    for (const routes of [masterDataRoutes, deviceRoutes])
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
        observed('x', { serialNo: 'SN-UNKNOWN' }),
      ]),
      'manual',
    );
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('proposes a plan to the 负责人 and to each asset manager, and carries it out', async () => {
    const pc = await record('x');
    model.decisions = [
      { subject: laptop, action: 'transfer', target: wangWu },
      { subject: pc, action: 'ignore' },
    ];
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

  it('raises nothing again that a person carried out or set aside', async () => {
    model.decisions = [{ subject: laptop, action: 'verify' }];
    await followUp().afterSync(null);
    const mine = await settled(() => latest('owner:mia'));
    // Nothing to carry out: a note, no plan.
    expect(mine.result).toMatchObject({ planId: null });
    expect((mine.result?.notes as string[]).length).toBe(1);
    await followUp().dismiss(mine.id, 'mia');
    const anns = await settled(() => latest('shared:ann'));
    await followUp().dismiss(anns.id, 'ann');

    expect(await followUp().afterSync(null)).toEqual([]);
  });

  it('replaces a suggestion left waiting, and settles the other asset managers’ with the first', async () => {
    managers = ['ann', 'mia'];
    await followUp().afterSync(null);
    const first = await settled(() => latest('owner:mia'));
    await settled(() => latest('shared:mia'));
    // The next pull replaces what still waits.
    await followUp().afterSync(null);
    expect((await runs().get(first.id))?.status).toBe('superseded');

    const anns = await settled(() => latest('shared:ann'));
    await followUp().dismiss(anns.id, 'ann');
    expect((await latest('shared:mia'))?.status).toBe('superseded');
    // Only its person sets it aside.
    const mine = await settled(() => latest('owner:mia'));
    await expect(followUp().dismiss(mine.id, 'ann')).rejects.toThrow();
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
