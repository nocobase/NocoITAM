// @vitest-environment node
import { databaseManagerToken } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ModelSession } from '../../server/providers/itam/ai-model.js';
import type { ObservedDevice } from '../../server/providers/itam/device-sources.js';
import { deviceSyncServiceToken } from '../../server/providers/itam/device-sync.js';
import { DEVICE_SYNC_EVALS } from '../../server/providers/itam/evals/device-sync.js';
import { historyServiceToken } from '../../server/providers/itam/history.js';
import {
  runEval,
  scoreCase,
  type EvalDecision,
} from '../../server/providers/itam/skill-evals.js';
import { agentCommandRoutes } from '../../server/routes/itam/agent-commands.js';
import { aiRoutes } from '../../server/routes/itam/ai.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };
const employee = { user: 'li', role: 'employee' as const };

const ago = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString();
const observed = (
  externalId: string,
  values: Partial<ObservedDevice>,
): ObservedDevice => ({
  externalId,
  serialNo: null,
  deviceName: externalId.toUpperCase(),
  manufacturer: 'Lenovo',
  model: 'ThinkPad T14 Gen 5',
  osName: 'Windows',
  osVersion: '10.0.26100',
  userPrincipal: null,
  userName: null,
  ownership: 'company',
  compliance: 'compliant',
  encrypted: true,
  wifiMac: null,
  enrolledAt: ago(30),
  lastSyncAt: ago(1),
  raw: { id: externalId },
  ...values,
});

describe('Noco on device sync', () => {
  let app: TestApp;
  type Who = { user: string; role: 'employee' | 'support' | 'manager' };
  const post = (
    path: string,
    body: Record<string, unknown>,
    who: Who = manager,
  ) => app.request(`/api/${path}`, { ...json(body), ...who });
  const get = (path: string, who: Who = manager) =>
    app.request(`/api/${path}`, who);
  const data = async <T = Record<string, unknown>>(response: Response) =>
    ((await response.json()) as { data: T }).data;
  const managedId = async (externalId: string) =>
    (
      await app.container
        .resolve(databaseManagerToken)
        .query()
        .selectFrom('managedDevices')
        .select('id')
        .where('externalId', '=', externalId)
        .executeTakeFirstOrThrow<{ id: string }>()
    ).id;

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [
      masterDataRoutes,
      deviceRoutes,
      agentCommandRoutes,
      aiRoutes,
    ])
      await app.mount(routes);
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('reads the review as the person, one device or one view', async () => {
    const laptop = await data<{ id: string }>(
      await post('itam/devices', {
        modelId: 'model-thinkpad-t14-gen5',
        locationId: 'loc-hq',
        serialNo: 'ON-INTUNE',
      }),
    );
    await app.container.resolve(deviceSyncServiceToken).ingest(
      'intune',
      (async function* () {
        yield [
          observed('known', { serialNo: 'ON-INTUNE' }),
          observed('stranger', { serialNo: 'NOT-ON-BOOKS' }),
        ];
      })(),
      'schedule',
    );
    const view = await data<{ connected: boolean; rows: { id: string }[] }>(
      await get('assistant/device-sync/review?view=unregistered'),
    );
    expect(view.connected).toBe(true);
    expect(view.rows).toHaveLength(1);
    const one = await data<{
      platformRecords: { externalId: string }[];
      differences: { kind: string }[];
    }>(await get(`assistant/device-sync/review?deviceId=${laptop.id}`));
    expect(one.platformRecords.map((row) => row.externalId)).toEqual(['known']);
    // In stock and syncing: someone has it.
    expect(one.differences.map((row) => row.kind)).toEqual(['statusMismatch']);
    expect(
      (await get('assistant/device-sync/review?view=checks', employee)).status,
    ).not.toBe(200);
  });

  it('carries out a plan that registers, links and keeps platform devices off the register', async () => {
    const existing = await data<{ id: string }>(
      await post('itam/devices', {
        modelId: 'model-thinkpad-t14-gen5',
        locationId: 'loc-hq',
        serialNo: 'BOOK-SERIAL',
      }),
    );
    await app.container.resolve(deviceSyncServiceToken).ingest(
      'intune',
      (async function* () {
        yield [
          observed('new-laptop', { serialNo: 'NEW-LAPTOP' }),
          observed('build-vm', { serialNo: 'To be filled by O.E.M.' }),
          observed('board-swap', { serialNo: 'PLATFORM-SERIAL' }),
        ];
      })(),
      'schedule',
    );
    const vm = await managedId('build-vm');
    const swapped = await managedId('board-swap');
    const plan = {
      title: '处理台账未登记的设备',
      steps: [
        {
          op: 'create_record',
          ref: 'laptop',
          params: {
            title: '补登记 NEW-LAPTOP',
            collection: 'devices',
            input: {
              modelId: 'model-thinkpad-t14-gen5',
              locationId: 'loc-hq',
              serialNo: 'NEW-LAPTOP',
              ownership: 'owned',
            },
          },
        },
        {
          op: 'ignore_managed_device',
          params: {
            title: 'BUILD-VM 不纳入台账',
            managedDeviceId: vm,
            reason: '构建用虚拟机',
          },
        },
        {
          op: 'link_managed_device',
          params: {
            title: '关联到换过主板的那台',
            managedDeviceId: swapped,
            deviceId: existing.id,
          },
        },
      ],
    };
    // Keeping a record off the register stands in for creating a device:
    // a reader who may not create devices may not propose it.
    expect((await post('assistant/plans', plan, employee)).status).toBe(400);
    const response = await post('assistant/plans', plan);
    if (response.status !== 201) throw new Error(await response.text());
    const proposed = await data<{ id: string; revision: number }>(response);
    const done = await data<{ status: string; steps: { status: string }[] }>(
      await post(`assistant/plans/${proposed.id}/execute`, {
        revision: proposed.revision,
      }),
    );
    expect(done.steps.map((step) => step.status)).toEqual([
      'done',
      'done',
      'done',
    ]);
    const rows = (await app.container
      .resolve(databaseManagerToken)
      .query()
      .selectFrom('managedDevices')
      .select(['externalId', 'matchState', 'matchedBy', 'ignoreReason'])
      .orderBy('externalId')
      .execute()) as Record<string, unknown>[];
    expect(rows).toEqual([
      {
        externalId: 'board-swap',
        matchState: 'linked',
        matchedBy: 'manual',
        ignoreReason: null,
      },
      {
        externalId: 'build-vm',
        matchState: 'ignored',
        matchedBy: null,
        ignoreReason: '构建用虚拟机',
      },
      // Created by the plan, linked by its serial at once.
      {
        externalId: 'new-laptop',
        matchState: 'linked',
        matchedBy: 'serial',
        ignoreReason: null,
      },
    ]);
    const linked = (
      await app.container
        .resolve(historyServiceToken)
        .events({ subjectType: 'devices', subjectId: existing.id })
    ).data.find((event) => event.type === 'managedLinked');
    expect(linked).toMatchObject({ origin: 'agent', actorId: 'mia' });
  });

  it('offers the new operations to a plan', async () => {
    const ops = await data<{ ops: Record<string, unknown> }>(
      await get('assistant/plans/ops'),
    );
    expect(Object.keys(ops.ops)).toEqual(
      expect.arrayContaining([
        'link_managed_device',
        'unlink_managed_device',
        'ignore_managed_device',
      ]),
    );
  });

  it('runs an eval set only for an administrator, and only with a model', async () => {
    expect(
      (await app.request('/api/itam/ai/evals/device-sync', json({}))).status,
    ).toBe(401);
    expect((await post('itam/ai/evals/device-sync', {}, employee)).status).toBe(
      403,
    );
    expect((await post('itam/ai/evals/nothing', {})).status).toBe(404);
    // The test application has no Agents plugin, so no model.
    const response = await post('itam/ai/evals/device-sync', {});
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ rule: 'ai.unavailable' });
  });
});

describe('the device-sync eval set', () => {
  it('names in each answer only items its data holds', () => {
    const strays = DEVICE_SYNC_EVALS.flatMap((item) => {
      const text = JSON.stringify(item.data);
      return item.expect
        .filter(
          (decision) =>
            !text.includes(`"${decision.subject}"`) ||
            (decision.target && !text.includes(decision.target)),
        )
        .map((decision) => `${item.id}: ${decision.subject}`);
    });
    expect(strays).toEqual([]);
  });

  it('passes a case only when every expected decision matches', () => {
    const batch = DEVICE_SYNC_EVALS.find(
      (item) => item.id === 'unregistered-batch',
    )!;
    const right: EvalDecision[] = [
      { subject: 'md-laptop', action: 'register' },
      { subject: 'md-vm', action: 'ignore' },
      { subject: 'md-shared', action: 'link', target: 'dev-51' },
    ];
    expect(scoreCase(batch, right)).toMatchObject({ passed: true, misses: [] });
    const wrongTarget = right.map((decision) =>
      decision.subject === 'md-shared'
        ? { ...decision, target: 'dev-88' }
        : decision,
    );
    expect(scoreCase(batch, wrongTarget)).toMatchObject({
      passed: false,
      misses: ['md-shared'],
    });
    expect(scoreCase(batch, null)).toMatchObject({ passed: false });
  });

  it('runs every case through a model session and counts the passes', async () => {
    const asked: string[] = [];
    const answers = new Map(
      DEVICE_SYNC_EVALS.map((item) => [item.question, item.expect]),
    );
    const session = (system: string): ModelSession => ({
      ask: async () => '',
      async askJson(content) {
        asked.push(system);
        const question = [...answers.keys()].find((key) =>
          content.includes(key),
        );
        // The silent laptop is answered wrongly, by marking it lost.
        if (question === 'DE-000048 失联了，要标记丢失吗？')
          return {
            decisions: [{ subject: 'dev-48', action: 'keep' }],
          } as never;
        return { decisions: answers.get(question ?? '') ?? [] } as never;
      },
    });
    const report = await runEval({
      skill: 'device-sync',
      instructions: 'METHOD',
      open: async (system) => session(system),
    });
    expect(report.total).toBe(DEVICE_SYNC_EVALS.length);
    expect(report.passed).toBe(DEVICE_SYNC_EVALS.length - 1);
    expect(
      report.cases
        .filter((result) => !result.passed)
        .map((result) => result.id),
    ).toEqual(['silent-laptop']);
    expect(new Set(asked)).toEqual(new Set(['METHOD']));
  });
});
