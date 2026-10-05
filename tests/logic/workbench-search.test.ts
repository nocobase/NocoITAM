// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { workbenchRoutes } from '../../server/routes/itam/workbench.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };

interface Group {
  readonly key: string;
  readonly collection: string;
  readonly total: number;
  readonly rows: readonly Record<string, unknown>[];
}

/**
 * The workbench's search box: one request, grouped by the list page each
 * result belongs to, each group read under the caller's own `read`.
 */
describe('workbench search', () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await createTestApp();
    await app.mount(masterDataRoutes);
    await app.mount(workbenchRoutes);
    const create = async (path: string, body: Record<string, unknown>) => {
      const response = await app.request(`/api/itam/master/${path}`, {
        ...json(body),
        ...manager,
      });
      if (response.status !== 201)
        throw new Error(`${path}: ${await response.text()}`);
    };
    const department = await app.request('/api/itam/master/departments', {
      ...json({ name: 'Northwind R&D' }),
      ...manager,
    });
    const departmentId = ((await department.json()) as { data: { id: string } })
      .data.id;
    await create('people', {
      name: 'Northwind Zhang',
      employeeNo: 'E-7001',
      departmentId,
    });
    await create('vendors', {
      name: 'Northwind Supplies',
      types: ['equipment'],
    });
  });

  afterEach(async () => {
    await app.destroy();
  });

  const search = async (q: string, who: Record<string, string> = manager) => {
    const response = await app.request(
      `/api/itam/workbench/search?q=${encodeURIComponent(q)}`,
      who,
    );
    return response;
  };

  it('refuses an anonymous caller', async () => {
    expect((await search('north', {})).status).toBe(401);
  });

  it('groups matches by the page they belong to, in the box order', async () => {
    const response = await search('northwind');
    expect(response.status).toBe(200);
    const groups = ((await response.json()) as { data: Group[] }).data;
    expect(groups.map((group) => group.key)).toEqual([
      'people',
      'vendors',
      'departments',
    ]);
    const people = groups[0]!;
    expect(people.total).toBe(1);
    expect(people.rows[0]).toMatchObject({
      name: 'Northwind Zhang',
      employeeNo: 'E-7001',
    });
    // Only what names a result travels, not the whole record.
    expect(people.rows[0]).not.toHaveProperty('departmentId');
  });

  it('leaves out a group with no match', async () => {
    const groups = (
      (await (await search('E-7001')).json()) as { data: Group[] }
    ).data;
    expect(groups.map((group) => group.key)).toEqual(['people']);
  });

  it('shows a reader only what they may read, without refusing them', async () => {
    // The double's employee holds no collection grant at all.
    const response = await search('northwind', {
      user: 'eve',
      role: 'employee',
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: Group[] }).data).toEqual([]);
  });

  it('asks for something to search for', async () => {
    expect((await search('   ')).status).toBe(400);
  });
});
