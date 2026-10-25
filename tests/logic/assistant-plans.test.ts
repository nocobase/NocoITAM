// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  businessContext,
  getRecord,
  onboardingPlan,
  readerFor,
} from '../../server/providers/itam-agents/reads.js';
import { addDays, today } from '../../server/providers/itam/dates.js';
import { planServiceToken } from '../../server/providers/itam/plans.js';
import { agentCommandRoutes } from '../../server/routes/itam/agent-commands.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { stockRoutes } from '../../server/routes/itam/stock.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

// Programmatic scopes treat `mia` as a manager and anyone else as an
// employee (MANAGER_USERS), as a plan checked or carried out as them is.
const manager = { user: 'mia', role: 'manager' as const };
const employee = { user: 'li', role: 'employee' as const };

/**
 * The assistant on the Agents plugin (template 1.0.0-beta.64): it reads the
 * register through its commands as the person it works for, and every change
 * it asks for is a plan that person carries out — each step through the same
 * service and under the same grants as the page that does it.
 */
describe('the assistant’s commands and plans', () => {
  let app: TestApp;
  let modelId = '';
  let locationId = '';
  let personId = '';
  type Who = { user: string; role: 'employee' | 'support' | 'manager' };
  const post = (
    path: string,
    body: Record<string, unknown>,
    who: Who = manager,
  ) => app.request(`/api/${path}`, { ...json(body), ...who });
  const get = (path: string, who: Who = manager) =>
    app.request(`/api/${path}`, who);
  const data = async <T = Record<string, unknown>>(
    response: Response,
  ): Promise<T> => ((await response.json()) as { data: T }).data;
  const create = async (path: string, body: Record<string, unknown>) => {
    const response = await post(`itam/${path}`, body);
    if (response.status !== 201)
      throw new Error(`${path}: ${await response.text()}`);
    return data<{ id: string }>(response);
  };

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [
      masterDataRoutes,
      deviceRoutes,
      stockRoutes,
      agentCommandRoutes,
    ])
      await app.mount(routes);
    const manufacturer = await create('master/manufacturers', {
      name: 'Test Apple',
    });
    const category = await create('master/categories', {
      name: 'Laptop',
      appliesTo: 'device',
      requiresSerial: true,
    });
    modelId = (
      await create('master/models', {
        name: 'MacBook Pro 14',
        categoryId: category.id,
        manufacturerId: manufacturer.id,
      })
    ).id;
    locationId = (
      await create('master/locations', { name: 'HQ', type: 'company' })
    ).id;
    const department = await create('master/departments', { name: 'R&D' });
    personId = (
      await create('master/people', {
        name: 'Li Na',
        departmentId: department.id,
        userId: employee.user,
      })
    ).id;
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('checks a plan when it is proposed, and changes nothing until it is carried out', async () => {
    const laptop = await create('devices', {
      modelId,
      locationId,
      serialNo: 'SN-1',
    });
    const plan = {
      title: 'Give Li Na a laptop',
      steps: [
        {
          op: 'assign_device',
          params: {
            title: 'Assign SN-1 to Li Na',
            deviceId: laptop.id,
            targetId: personId,
          },
        },
      ],
    };

    // A step that would be refused is named, and nothing is kept.
    const refused = await post('assistant/plans', {
      title: 'Broken',
      steps: [{ op: 'assign_device', params: { title: 'x' } }],
    });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({
      error: { reason: 'PLAN_STEP_REFUSED', metadata: { field: 'steps.1' } },
    });
    // An operation the person does not hold is refused for them.
    expect((await post('assistant/plans', plan, employee)).status).toBe(400);

    const proposed = await data<{
      id: string;
      status: string;
      revision: number;
      steps: {
        check: { title: string; fields: { field: string; name?: string }[] };
      }[];
    }>(await post('assistant/plans', plan));
    expect(proposed.status).toBe('pending');
    // The card names the records the ids stand for.
    expect(proposed.steps[0].check.title).toBe('Assign SN-1 to Li Na');
    expect(proposed.steps[0].check.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'targetId', name: 'Li Na' }),
      ]),
    );
    // A list's entries are named too, each its own fields (2026-10-22): the
    // card showed a return's items as raw JSON, ids and all.
    const held = await data<{ id: string }>(
      await post('itam/devices', { modelId, locationId, serialNo: 'SN-2' }),
    );
    await post(`itam/devices/${held.id}/assign`, {
      targetType: 'person',
      targetId: personId,
    });
    const returning = await data<{
      steps: {
        check: {
          fields: {
            field: string;
            items?: { field: string; name?: string }[][];
          }[];
        };
      }[];
    }>(
      await post('assistant/plans', {
        title: 'Take the laptop back',
        steps: [
          {
            op: 'return_devices',
            params: {
              title: 'Return SN-2',
              items: [{ deviceId: held.id, nextStatus: 'inStock' }],
            },
          },
        ],
      }),
    );
    const items = returning.steps[0].check.fields.find(
      (field) => field.field === 'items',
    )?.items;
    expect(items?.[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'deviceId',
          name: expect.any(String),
        }),
        expect.objectContaining({ field: 'nextStatus' }),
      ]),
    );
    // Nothing has changed yet.
    expect(
      (await data<{ status: string }>(await get(`itam/devices/${laptop.id}`)))
        .status,
    ).toBe('inStock');

    // A plan is its proposer's: nobody else sees or decides it.
    expect((await get(`assistant/plans/${proposed.id}`, employee)).status).toBe(
      404,
    );

    const done = await data<{ status: string; steps: { status: string }[] }>(
      await post(`assistant/plans/${proposed.id}/execute`, {
        revision: proposed.revision,
      }),
    );
    expect(done.status).toBe('executed');
    expect(done.steps.map((step) => step.status)).toEqual(['done']);
    const device = await data<{ status: string; assigneeId: string }>(
      await get(`itam/devices/${laptop.id}`),
    );
    expect(device).toMatchObject({ status: 'inUse', assigneeId: personId });

    // Decided once: a second decision is refused.
    expect(
      (
        await post(`assistant/plans/${proposed.id}/void`, {
          revision: proposed.revision,
        })
      ).status,
    ).toBe(400);
  });

  it('stops at the first step refused, keeping what ran, and names it', async () => {
    const laptop = await create('devices', {
      modelId,
      locationId,
      serialNo: 'SN-2',
    });
    const assign = {
      op: 'assign_device',
      params: { deviceId: laptop.id, targetId: personId },
    };
    const proposed = await data<{ id: string; revision: number }>(
      await post('assistant/plans', {
        title: 'Assign twice',
        // The second assignment is refused only once the first has run.
        steps: [assign, assign],
      }),
    );
    const done = await data<{
      status: string;
      failure: { position: number; code: string };
      steps: { status: string }[];
    }>(
      await post(`assistant/plans/${proposed.id}/execute`, {
        revision: proposed.revision,
      }),
    );
    expect(done.status).toBe('failed');
    expect(done.failure.position).toBe(2);
    expect(done.steps.map((step) => step.status)).toEqual(['done', 'failed']);
  });

  it('lets a later step name the record an earlier one creates', async () => {
    const floor = await create('master/locations', {
      name: '3F',
      type: 'floor',
      parentId: locationId,
    });
    const proposed = await data<{
      id: string;
      revision: number;
      steps: {
        check: { fields: { field: string; value: unknown; name?: string }[] };
      }[];
    }>(
      await post('assistant/plans', {
        title: 'Register and assign a laptop',
        steps: [
          {
            op: 'create_record',
            ref: 'laptop',
            params: {
              collection: 'devices',
              input: {
                modelId,
                locationId: floor.id,
                ownership: 'owned',
                serialNo: 'SN-NEW',
              },
            },
          },
          {
            op: 'assign_device',
            params: { deviceId: '$laptop', targetId: personId },
          },
        ],
      }),
    );
    // A record step's own fields, named, not `collection` and an `input`
    // object (2026-10-22).
    const fields = proposed.steps[0].check.fields;
    expect(fields.map((field) => field.field)).not.toContain('input');
    expect(fields.map((field) => field.field)).not.toContain('collection');
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'serialNo', value: 'SN-NEW' }),
        expect.objectContaining({ field: 'modelId', name: expect.any(String) }),
        expect.objectContaining({ field: 'ownership', value: 'owned' }),
        // By its whole path (2026-10-22).
        expect.objectContaining({ field: 'locationId', name: 'HQ › 3F' }),
      ]),
    );
    const done = await data<{
      status: string;
      steps: { result: { id?: string } }[];
    }>(
      await post(`assistant/plans/${proposed.id}/execute`, {
        revision: proposed.revision,
      }),
    );
    expect(done.status).toBe('executed');
    const id = String(done.steps[0].result.id);
    expect(
      await data<{ serialNo: string; assigneeId: string }>(
        await get(`itam/devices/${id}`),
      ),
    ).toMatchObject({ serialNo: 'SN-NEW', assigneeId: personId });
  });

  it('declines a plan, and lets it expire after a day', async () => {
    const plans = app.container.resolve(planServiceToken);
    const outcomes: string[] = [];
    plans.onDecided = (outcome) => {
      outcomes.push(outcome.decision);
      return Promise.resolve();
    };
    const laptop = await create('devices', {
      modelId,
      locationId,
      serialNo: 'SN-3',
    });
    const step = {
      op: 'assign_device',
      params: { deviceId: laptop.id, targetId: personId },
    };
    const declined = await plans.create(
      manager.user,
      { title: 'One', steps: [step] },
      { agentId: null, agentName: null, runId: null, conversationId: 'c1' },
    );
    await plans.void(manager.user, declined.id, declined.revision);
    expect(outcomes).toEqual(['voided']);

    const stale = await plans.create(
      manager.user,
      { title: 'Two', steps: [step] },
      { agentId: null, agentName: null, runId: null, conversationId: null },
    );
    await app.db.database
      .query()
      .updateTable('itamPlans')
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where('id', '=', stale.id)
      .execute();
    // Read as expired, listed with the expired ones, and nothing written
    // (2026-10-25: Demo Mode refuses a write while reading).
    expect((await plans.get(manager.user, stale.id)).status).toBe('expired');
    expect(
      (
        await plans.list(manager.user, {
          status: 'pending',
          page: 1,
          pageSize: 20,
        })
      ).data.map((plan) => plan.id),
    ).not.toContain(stale.id);
    expect(
      (
        await plans.list(manager.user, {
          status: 'expired',
          page: 1,
          pageSize: 20,
        })
      ).data.map((plan) => plan.id),
    ).toContain(stale.id);
    expect(await plans.expireDue()).toBe(1);
    expect((await plans.get(manager.user, stale.id)).status).toBe('expired');
  });

  it('reads the register as the person, with names beside the ids', async () => {
    const laptop = await create('devices', {
      modelId,
      locationId,
      serialNo: 'SN-R1',
    });
    await post(`itam/devices/${laptop.id}/assign`, {
      targetType: 'person',
      targetId: personId,
    });
    const reader = readerFor(app.container, manager.user);
    const person = await getRecord(reader, 'people', personId);
    expect(
      (person.related as { devices: Record<string, unknown>[] }).devices[0],
    ).toMatchObject({ id: laptop.id, modelName: 'MacBook Pro 14' });
    // Who is asking: the employee's own user id and person record.
    expect(
      (await businessContext(readerFor(app.container, employee.user))).me,
    ).toMatchObject({ userId: employee.user, personId });
    // The same through the command.
    expect(
      await data(
        await post('assistant/search', {
          collection: 'devices',
          q: 'SN-R1',
        }),
      ),
    ).toMatchObject({ total: 1 });
  });

  it('reads a joiner’s onboarding plan, the system’s choice of device', async () => {
    const laptop = await create('devices', {
      modelId: 'model-macbook-pro-14-m3',
      locationId,
      serialNo: 'SN-JOIN-1',
    });
    const joiner = await create('master/people', {
      name: 'Sun Hao',
      departmentId: 'dept-rd',
      position: 'Frontend Engineer',
      hireDate: addDays(today(), 5),
    });
    const read = (await onboardingPlan(
      readerFor(app.container, manager.user),
      joiner.id,
    )) as {
      plan: {
        lines: { target: { id: string }; proposals: { id: string }[] }[];
      };
    };
    expect(
      read.plan.lines.find(
        (line) => line.target.id === 'model-macbook-pro-14-m3',
      )?.proposals,
    ).toEqual([expect.objectContaining({ id: laptop.id })]);
  });

  it('lists every operation a plan may hold, with its parameters', async () => {
    const ops = await data<{ ops: Record<string, unknown> }>(
      await get('assistant/plans/ops'),
    );
    expect(Object.keys(ops.ops)).toEqual(
      expect.arrayContaining([
        'assign_device',
        'return_devices',
        'reserve_device',
        'assign_seat',
        'create_purchase_order',
        'create_record',
        'issue_stock',
      ]),
    );
  });
});
