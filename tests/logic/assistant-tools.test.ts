// @vitest-environment node
import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ITAM_TOOLS,
  registerAssistant,
} from '../../server/providers/itam-agents/assistant.js';
import { planServiceToken } from '../../server/providers/itam/plans.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

type Projection = {
  input(value: unknown): unknown;
  output(value: unknown): unknown;
};
type Execute = (
  input: unknown,
  options: { context: { user: { id: string }; sessionId: string } },
) => Promise<unknown>;
type Scope = () => Promise<{
  tool: string[];
  model: string[];
  systemPromptTemplate: string;
}>;

/**
 * Asset Steward on the Agents plugin's OnlineAgent service (plugin 1.0): the
 * tools it registers read and propose as the person chatting, a plan is
 * kept for the conversation it was proposed in, a refusal comes back for
 * the model to act on, and every native conversation gets the tools, the
 * enabled chat models (the default first) and the instructions.
 */
describe('Asset Steward’s tools', () => {
  let app: TestApp;
  let tools: Map<
    string,
    { definition: { execute: Execute; public: Projection } }
  >;
  let scope: Scope | null;
  let modelId = '';
  let locationId = '';
  let personId = '';
  const manager = { user: 'mia', role: 'manager' as const };
  const create = async (path: string, body: Record<string, unknown>) => {
    const response = await app.request(`/api/itam/${path}`, {
      ...json(body),
      ...manager,
    });
    if (response.status !== 201)
      throw new Error(`${path}: ${await response.text()}`);
    return ((await response.json()) as { data: { id: string } }).data;
  };
  const call = (name: string, input: unknown, user = 'mia') => {
    const tool = tools.get(name);
    if (!tool) throw new Error(`${name} is not registered`);
    return tool.definition.execute(input, {
      context: { user: { id: user }, sessionId: 'conversation-1' },
    });
  };

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [masterDataRoutes, deviceRoutes])
      await app.mount(routes);
    tools = new Map();
    scope = null;
    const agents = {
      onlineAgent: {
        configurator: {
          registerTool: (
            name: string,
            spec: { definition: { execute: Execute; public: Projection } },
          ) => tools.set(name, spec),
          registerOnlineAgentGlobalScope: (provider: Scope) => {
            scope = provider;
          },
        },
      },
      models: {
        services: {
          list: async () => [
            {
              name: 'cloud',
              enabled: true,
              models: [
                { kind: 'chat', value: 'small' },
                { kind: 'chat', value: 'large' },
                { kind: 'embedding', value: 'vectors' },
              ],
            },
            {
              name: 'off',
              enabled: false,
              models: [{ kind: 'chat', value: 'old' }],
            },
          ],
          defaults: async () => ({
            effectiveChat: { modelService: 'cloud', model: 'large' },
          }),
        },
      },
    } as unknown as Agents;
    registerAssistant(agents, app.container, () => ({
      businessNotes: 'Laptops are replaced every four years.',
      timeZone: 'Asia/Shanghai',
    }));

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
        userId: 'li',
      })
    ).id;
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('gives every native conversation the tools, the chat models with the default first, and the instructions', async () => {
    expect([...tools.keys()].sort()).toEqual(Object.values(ITAM_TOOLS).sort());
    if (!scope) throw new Error('no global scope');
    const given = await scope();
    expect(given.tool).toEqual(Object.values(ITAM_TOOLS));
    expect(given.model).toEqual(['cloud/large', 'cloud/small']);
    expect(given.systemPromptTemplate).toContain(
      'Laptops are replaced every four years.',
    );
    expect(given.systemPromptTemplate).toContain('Asia/Shanghai');
    expect(given.systemPromptTemplate).toContain(ITAM_TOOLS.planCreate);
  });

  it('reads the register as the person chatting', async () => {
    const matched = (await call(ITAM_TOOLS.modelMatch, {
      text: 'MacBook Pro 14',
    })) as { models: { id: string }[] };
    expect(matched.models.map((model) => model.id)).toContain(modelId);
  });

  it('keeps a proposed plan for its conversation, and returns a refused step for the model to fix', async () => {
    const laptop = await create('devices', {
      modelId,
      locationId,
      serialNo: 'SN-1',
    });
    const proposed = (await call(ITAM_TOOLS.planCreate, {
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
    })) as { id: string; status: string; steps: number };
    expect(proposed).toMatchObject({ status: 'pending', steps: 1 });
    const kept = await app.container
      .resolve(planServiceToken)
      .list('mia', { conversationId: 'conversation-1', page: 1, pageSize: 10 });
    expect(kept.data.map((plan) => plan.id)).toEqual([proposed.id]);

    expect(
      await call(ITAM_TOOLS.planCreate, {
        title: 'Broken',
        steps: [{ op: 'assign_device', params: { title: 'x' } }],
      }),
    ).toMatchObject({
      error: { code: 'PLAN_STEP_REFUSED', field: 'steps.1' },
    });
  });

  it('shows the page that a tool ran and why it was refused, never what it read', () => {
    const search = tools.get(ITAM_TOOLS.search)?.definition.public;
    if (!search) throw new Error('no public projection');
    expect(search.input({ collection: 'people', q: 'Li' })).toEqual({});
    expect(search.output({ data: [{ id: 'p1', name: 'Li Na' }] })).toEqual({});
    expect(
      search.output({ error: { message: 'Not allowed', code: 'FORBIDDEN' } }),
    ).toEqual({ error: { message: 'Not allowed' } });
  });
});
