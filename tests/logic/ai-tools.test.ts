// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import searchRecords from '../../ai/tools/itam/search-records.js';
import businessContext from '../../ai/tools/itam/business-context.js';
import getRecord from '../../ai/tools/itam/get-record.js';
import assignDevice from '../../ai/tools/itam/assign-device.js';
import returnDevices from '../../ai/tools/itam/return-devices.js';
import createRecord from '../../ai/tools/itam/create-record.js';
import issueStock from '../../ai/tools/itam/issue-stock.js';
import stockIn from '../../ai/tools/itam/stock-in.js';
import onboardingPlan from '../../ai/tools/itam/onboarding-plan.js';
import reserveDevice from '../../ai/tools/itam/reserve-device.js';
import { addDays, today } from '../../server/providers/itam/dates.js';
import { aiRoutes } from '../../server/routes/itam/ai.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { stockRoutes } from '../../server/routes/itam/stock.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };
const employee = { user: 'li', role: 'employee' as const };

describe('AI write tools, inspection and tools', () => {
  let app: TestApp;
  let modelId = '';
  let locationId = '';
  let personId = '';
  const post = (
    path: string,
    body: Record<string, unknown> = {},
    who: { user: string; role: 'employee' | 'support' | 'manager' } = manager,
  ) => app.request(`/api/itam/${path}`, { ...json(body), ...who });
  const get = (
    path: string,
    who: { user: string; role: 'employee' | 'support' | 'manager' } = manager,
  ) => app.request(`/api/itam/${path}`, who);
  const data = async <T = Record<string, unknown>>(
    response: Response,
  ): Promise<T> => ((await response.json()) as { data: T }).data;
  const create = async (path: string, body: Record<string, unknown>) => {
    const response = await post(path, body);
    if (response.status !== 201)
      throw new Error(`${path}: ${await response.text()}`);
    return data<{ id: string }>(response);
  };
  /** A tool invocation the way the AI runtime performs it. */
  const invoke = (
    tool: {
      invoke: (ctx: never, args: unknown, runtime: never) => Promise<unknown>;
    },
    userId: string,
    args: unknown,
  ) =>
    tool.invoke(
      {
        actor: { id: userId, roles: [], isRoot: false },
        state: { sessionId: 's1' },
      } as never,
      args,
      { toolCallId: 'c1', writer: () => {} } as never,
    ) as Promise<{ status: string; content: Record<string, unknown> }>;

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [
      masterDataRoutes,
      deviceRoutes,
      stockRoutes,
      aiRoutes,
    ]) {
      await app.mount(routes);
    }
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

  it('writes as the confirming user, refuses by throwing, and runs batches row by row', async () => {
    const a1 = await create('devices', {
      modelId,
      locationId,
      serialNo: 'SN-1',
    });
    const a2 = await create('devices', {
      modelId,
      locationId,
      serialNo: 'SN-2',
    });

    // The plugin holds a write tool until the user confirms it: ASK.
    expect(assignDevice.defaultPermission).toBe('ASK');
    expect(returnDevices.defaultPermission).toBe('ASK');

    // Before confirmation the card asks whether this user could do it.
    const args = {
      title: 'Assign SN-1 to Li Na',
      deviceId: a1.id,
      targetId: personId,
    };
    expect(
      await data(await post('ai/screen', { tool: 'itam_assign_device', args })),
    ).toEqual({ ok: true });
    expect(
      await data(
        await post('ai/screen', { tool: 'itam_assign_device', args }, employee),
      ),
    ).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(
      await data(
        await post('ai/screen', {
          tool: 'itam_assign_device',
          args: { title: 'x' },
        }),
      ),
    ).toMatchObject({ ok: false, code: 'VALIDATION' });

    // Confirmed: it runs as the manager, through the device service.
    const assigned = await invoke(assignDevice, manager.user, args);
    expect(assigned.status).toBe('success');
    expect(assigned.content).toMatchObject({ id: a1.id, status: 'inUse' });
    const device = await data<{ status: string; assigneeId: string }>(
      await get(`devices/${a1.id}`),
    );
    expect(device.assigneeId).toBe(personId);

    // A refusal is thrown, carrying the rule, so the plugin records it as
    // the call's result rather than leaving the card pending.
    await expect(invoke(assignDevice, manager.user, args)).rejects.toThrow(
      /"code":/,
    );
    // An employee may not assign, whatever the assistant proposes.
    await expect(
      invoke(assignDevice, employee.user, { ...args, deviceId: a2.id }),
    ).rejects.toThrow(/FORBIDDEN/);

    // A batch: one row returns, the other (never assigned) is refused.
    const returned = await invoke(returnDevices, manager.user, {
      title: 'Return both',
      items: [{ deviceId: a1.id }, { deviceId: a2.id }],
    });
    expect(returned.content).toMatchObject({ done: 1, failed: 1 });
    const rows = returned.content.rows as { ok: boolean }[];
    expect(rows.map((row) => row.ok)).toEqual([true, false]);
    // Every row refused is the call's failure.
    await expect(
      invoke(returnDevices, manager.user, {
        title: 'Return again',
        items: [{ deviceId: a2.id }],
      }),
    ).rejects.toThrow();
  });

  it('reads a joiner’s onboarding plan and reserves what it proposes', async () => {
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
    type Plan = {
      plan: {
        kit: { id: string } | null;
        lines: {
          target: { id: string };
          preparedCount: number;
          proposals: { type: string; id: string }[];
        }[];
      };
    };
    const macbook = async () =>
      (
        (await invoke(onboardingPlan, manager.user, { personId: joiner.id }))
          .content as unknown as Plan
      ).plan.lines.find((line) => line.target.id === 'model-macbook-pro-14-m3');
    // The plan, not the model, says which laptop.
    expect((await macbook())?.proposals).toEqual([
      expect.objectContaining({ type: 'device', id: laptop.id }),
    ]);
    // Reserving is held for confirmation like every write.
    expect(reserveDevice.defaultPermission).toBe('ASK');
    const reserved = await invoke(reserveDevice, manager.user, {
      title: 'Reserve for Sun Hao',
      deviceId: laptop.id,
      reservedForId: joiner.id,
      reservedUntil: addDays(today(), 5),
    });
    expect(reserved.status).toBe('success');
    expect((await macbook())?.preparedCount).toBe(1);
  });

  it('reads records with names and the ids the write tools take', async () => {
    const device = await create('devices', {
      modelId,
      locationId,
      serialNo: 'SN-R1',
    });
    await invoke(assignDevice, manager.user, {
      title: 'x',
      deviceId: device.id,
      targetId: personId,
    });
    // A person's holdings name each device and its model, not UUIDs alone.
    const person = await invoke(getRecord, manager.user, {
      collection: 'people',
      id: personId,
    });
    const held = (
      person.content.related as { devices: Record<string, unknown>[] }
    ).devices;
    expect(held[0]).toMatchObject({
      id: device.id,
      modelName: 'MacBook Pro 14',
      locationName: 'HQ',
    });
    // Who is asking: the employee's own user id and person record.
    const context = await invoke(businessContext, employee.user, {});
    expect(context.content.me).toMatchObject({
      userId: employee.user,
      personId,
    });
    // Repairs are searchable, like the other operations.
    expect(
      (await invoke(searchRecords, manager.user, { collection: 'repairs' }))
        .status,
    ).toBe('success');
    // A return goes where the page lets it: not straight back into use.
    expect(
      await data(
        await post('ai/screen', {
          tool: 'itam_return_devices',
          args: {
            title: 'x',
            items: [{ deviceId: device.id, nextStatus: 'inUse' }],
          },
        }),
      ),
    ).toMatchObject({ ok: false, code: 'VALIDATION' });
    // A device the operation cannot start from is refused on the card: one
    // in stock has nothing to return.
    const inStock = await create('devices', {
      modelId,
      locationId,
      serialNo: 'SN-R2',
    });
    expect(
      await data(
        await post('ai/screen', {
          tool: 'itam_return_devices',
          args: { title: 'x', items: [{ deviceId: inStock.id }] },
        }),
      ),
    ).toMatchObject({ ok: false, code: 'INVALID_STATUS' });
    // A batch with one row that can run still goes to the user.
    expect(
      await data(
        await post('ai/screen', {
          tool: 'itam_return_devices',
          args: {
            title: 'x',
            items: [{ deviceId: inStock.id }, { deviceId: device.id }],
          },
        }),
      ),
    ).toMatchObject({ ok: true });
    // A repair states when it is due back, as its dialog asks.
    expect(
      await data(
        await post('ai/screen', {
          tool: 'itam_create_record',
          args: {
            title: 'x',
            collection: 'repairs',
            input: {
              deviceId: device.id,
              method: 'internal',
              faultDescription: 'Screen flickers',
            },
          },
        }),
      ),
    ).toMatchObject({ ok: false, field: 'expectedReturnAt' });
  });

  it('creates any record the pages create, under the same rules and grants', async () => {
    expect(createRecord.defaultPermission).toBe('ASK');

    // A device, as the create dialog would send it.
    const device = await invoke(createRecord, manager.user, {
      title: '登记设备',
      collection: 'devices',
      input: { modelId, locationId, ownership: 'owned', serialNo: 'SN-AI-1' },
    });
    expect(device.content).toMatchObject({ collection: 'devices' });
    const created = await data<{ serialNo: string; status: string }>(
      await get(`devices/${String(device.content.id)}`),
    );
    expect(created).toMatchObject({ serialNo: 'SN-AI-1', status: 'inStock' });

    // What the create dialog requires, the card requires: a value it would
    // ask for, one a leased device calls for, and the serial its category
    // tracks — refused before confirmation and again when it runs.
    const screen = async (input: Record<string, unknown>) =>
      data(
        await post('ai/screen', {
          tool: 'itam_create_record',
          args: { title: 'x', collection: 'devices', input },
        }),
      );
    expect(
      await screen({ modelId, locationId, serialNo: 'SN-2' }),
    ).toMatchObject({ ok: false, code: 'VALIDATION', field: 'ownership' });
    expect(
      await screen({
        modelId,
        locationId,
        ownership: 'leased',
        serialNo: 'SN-2',
      }),
    ).toMatchObject({ ok: false, field: 'lenderVendorId' });
    expect(
      await screen({ modelId, locationId, ownership: 'owned' }),
    ).toMatchObject({ ok: false, field: 'serialNo' });
    await expect(
      invoke(createRecord, manager.user, {
        title: 'x',
        collection: 'devices',
        input: { modelId, locationId, ownership: 'owned' },
      }),
    ).rejects.toThrow('serial');
    expect(
      await screen({
        modelId,
        locationId,
        ownership: 'owned',
        serialNo: 'SN-2',
      }),
    ).toMatchObject({ ok: true });

    // The page's own schema: a field the dialog may not send is refused,
    // before the card offers confirmation and again when it runs.
    const stray = {
      title: 'x',
      collection: 'devices',
      input: { modelId, locationId, ownership: 'owned', bookValue: 1 },
    };
    expect(
      await data(
        await post('ai/screen', { tool: 'itam_create_record', args: stray }),
      ),
    ).toMatchObject({ ok: false, code: 'VALIDATION' });
    await expect(invoke(createRecord, manager.user, stray)).rejects.toThrow();
    // An employee may not create devices, whatever the assistant proposes.
    expect(
      await data(
        await post(
          'ai/screen',
          {
            tool: 'itam_create_record',
            args: {
              title: 'x',
              collection: 'devices',
              input: { modelId, locationId },
            },
          },
          employee,
        ),
      ),
    ).toMatchObject({ ok: false, code: 'FORBIDDEN' });

    // Master data too.
    const vendor = await invoke(createRecord, manager.user, {
      title: '新增供应商',
      collection: 'vendors',
      input: { name: 'AI Vendor Ltd', types: ['equipment'] },
    });
    expect(vendor.content).toMatchObject({
      collection: 'vendors',
      name: 'AI Vendor Ltd',
    });
  });

  it('stocks in and issues through the stock tools', async () => {
    const category = await create('master/categories', {
      name: 'Docks',
      appliesTo: 'accessory',
    });
    const dock = await create('master/models', {
      name: 'USB-C Dock',
      categoryId: category.id,
      manufacturerId: (
        await create('master/manufacturers', { name: 'Test Dock Co' })
      ).id,
    });
    const record = await invoke(createRecord, manager.user, {
      title: '新建扩展坞库存',
      collection: 'stockItems',
      input: {
        kind: 'accessory',
        name: 'USB-C Dock',
        categoryId: category.id,
        modelId: dock.id,
        locationId,
      },
    });
    const stockItemId = String(record.content.id);
    const stocked = await invoke(stockIn, manager.user, {
      title: '入库 5 个',
      stockItemId,
      quantity: 5,
    });
    expect(stocked.content).toMatchObject({ totalQuantity: 5 });
    const issued = await invoke(issueStock, manager.user, {
      title: '发给李娜',
      stockItemId,
      holderType: 'person',
      holderId: personId,
      quantity: 2,
    });
    expect(issued.content).toMatchObject({ usedQuantity: 2 });
  });

  it('reports availability from the plugin, and scopes tools to the actor', async () => {
    await create('devices', { modelId, locationId, serialNo: 'SN-3' });

    // No model is configured in tests: the assistant is not available, and
    // the inspection it used to run is gone with the self-built AI.
    const status = await data<{ configured: boolean; enabled: boolean }>(
      await get('ai/status'),
    );
    expect(status.configured).toBe(false);
    expect((await get('ai/findings')).status).toBe(404);

    // The search tool sees the manager's devices but not an employee's (none held).
    const managerSearch = await invoke(searchRecords, manager.user, {
      collection: 'devices',
      q: 'SN-3',
    });
    expect((managerSearch.content.rows as unknown[]).length).toBe(1);
    const employeeSearch = await invoke(searchRecords, 'zhang', {
      collection: 'devices',
      q: 'SN-3',
    });
    expect(employeeSearch.status).toBe('error');
  });
});

describe('ITAM AI resources', () => {
  it('registers the employee with every tool it names, writes held for confirmation', async () => {
    const { createAIManager } = await import('@nocobase/ai-employee');
    const { ItamAiResources } = await import('../../ai/index.js');
    const ai = createAIManager();
    await new ItamAiResources().registerAIResources(ai);

    const tools = await ai.toolsManager.listTools({});
    const byName = new Map(
      tools.map((tool) => [tool.definition.name, tool] as const),
    );
    const employee = (await ai.employeeManager.listEmployees()).find(
      (entry) => entry.username === 'itam',
    );
    expect(employee).toBeDefined();
    // The plugin does not scan `ai/`: a tool the employee names but the
    // registrar leaves out would not exist at runtime.
    for (const { name } of employee?.tools ?? [])
      expect([...byName.keys()]).toContain(name);
    for (const name of [
      'itam_assign_device',
      'itam_return_devices',
      'itam_create_purchase_order',
      'itam_create_disposal',
      'itam_reserve_device',
    ])
      expect(byName.get(name)?.defaultPermission).toBe('ASK');
    expect(byName.get('itam_onboarding_plan')?.defaultPermission).toBe(
      'ALLOW',
    );
    expect(byName.get('itam_search_records')?.defaultPermission).toBe('ALLOW');
  });
});

describe('the plugin built-in employees', () => {
  it('are switched off once, and stay as an administrator leaves them', async () => {
    const { createAIManager } = await import('@nocobase/ai-employee');
    const { ItamAiResources } = await import('../../ai/index.js');
    const { DEFAULT_ITAM_SETTINGS } =
      await import('../../server/providers/itam/settings.js');
    let ai = { ...DEFAULT_ITAM_SETTINGS.ai };
    const settings = {
      get: () => Promise.resolve(ai),
      set: (_key: string, value: typeof ai) => {
        ai = value;
        return Promise.resolve(value);
      },
    } as never;
    const manager = createAIManager();
    // What the plugin registers on its own.
    await manager.employeeManager.registerEmployee({ username: 'dex' });
    const enabled = async (username: string) =>
      (await manager.employeeManager.getEmployee(username))?.enabled;

    await new ItamAiResources(settings).registerAIResources(manager);
    expect(await enabled('dex')).toBe(false);
    expect(await enabled('itam')).toBe(true);
    expect(ai.builtInEmployeesDisabled).toBe(true);
    // Noco comes first on the AI employees page, which lists by sort.
    const order = (await manager.employeeManager.listEmployees()).map(
      (employee) => employee.username,
    );
    expect(order[0]).toBe('itam');

    // An administrator turns Dex back on; the next start keeps that.
    const dex = await manager.employeeManager.getEmployee('dex');
    await manager.employeeManager.upsertEmployee({ ...dex!, enabled: true });
    await new ItamAiResources(settings).registerAIResources(manager);
    expect(await enabled('dex')).toBe(true);
  });
});

describe('the ITAM skills on Noco', () => {
  const setup = async () => {
    const { createAIManager } = await import('@nocobase/ai-employee');
    const { ItamAiResources } = await import('../../ai/index.js');
    const { DEFAULT_ITAM_SETTINGS } =
      await import('../../server/providers/itam/settings.js');
    const state = { ai: { ...DEFAULT_ITAM_SETTINGS.ai } };
    const settings = {
      get: () => Promise.resolve(state.ai),
      set: (_key: string, value: typeof state.ai) => {
        state.ai = value;
        return Promise.resolve(value);
      },
    } as never;
    const manager = createAIManager();
    const register = () =>
      new ItamAiResources(settings).registerAIResources(manager);
    const skills = async () =>
      (await manager.employeeManager.getEmployee('itam'))?.skillSettings
        ?.enabledSkills;
    const save = async (enabledSkills: string[]) => {
      const employee = await manager.employeeManager.getEmployee('itam');
      await manager.employeeManager.upsertEmployee({
        ...employee!,
        skillSettings: { ...employee!.skillSettings, enabledSkills },
      });
    };
    return { state, register, skills, save };
  };

  it('are all enabled on a first registration, and recorded as offered', async () => {
    const { state, register, skills } = await setup();
    await register();
    expect(await skills()).toEqual(['offboarding', 'onboarding', 'receiving']);
    expect(state.ai.offeredSkills).toEqual([
      'offboarding',
      'onboarding',
      'receiving',
    ]);
  });

  it('reach a selection saved before they were added, once', async () => {
    const { state, register, skills, save } = await setup();
    await register();
    // A deployment registered when offboarding was the only skill, and its
    // selection saved then: nothing recorded what was offered.
    await save(['offboarding']);
    state.ai = { ...state.ai, offeredSkills: null };
    await register();
    expect(await skills()).toEqual(['offboarding', 'onboarding', 'receiving']);

    // Removed afterwards by the administrator, a skill stays removed.
    await save(['offboarding', 'receiving']);
    await register();
    expect(await skills()).toEqual(['offboarding', 'receiving']);
  });

  it('keep what the administrator added beside them', async () => {
    const { register, skills, save } = await setup();
    await register();
    await save(['offboarding', 'onboarding', 'receiving', 'data-query']);
    await register();
    expect(await skills()).toEqual([
      'offboarding',
      'onboarding',
      'receiving',
      'data-query',
    ]);
  });
});
