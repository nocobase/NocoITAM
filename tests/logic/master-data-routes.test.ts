// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { addDays, today } from '../../server/providers/itam/dates.js';
import { auditRoutes } from '../../server/routes/itam/audits.js';
import { entitlementRoutes } from '../../server/routes/itam/entitlements.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

describe('master data routes', () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await createTestApp();
    await app.mount(masterDataRoutes);
    await app.mount(entitlementRoutes);
    // A stocktake is one of the records a leaver answers for.
    await app.mount(auditRoutes);
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('rejects anonymous requests', async () => {
    const response = await app.request('/api/itam/master/manufacturers');
    expect(response.status).toBe(401);
  });

  it('rejects a caller without the read grant', async () => {
    const response = await app.request('/api/itam/master/manufacturers', {
      user: 'eve',
      role: 'employee',
    });
    expect(response.status).toBe(403);
  });

  it('returns 404 for an unknown collection', async () => {
    const response = await app.request('/api/itam/master/nothing', {
      user: 'mia',
      role: 'manager',
    });
    expect(response.status).toBe(404);
  });

  it('creates, lists, reads, updates and deletes a manufacturer', async () => {
    const created = await app.request('/api/itam/master/manufacturers', {
      ...json({ name: 'Apple', website: 'https://apple.com' }),
      user: 'mia',
      role: 'manager',
    });
    expect(created.status).toBe(201);
    const { data } = (await created.json()) as {
      data: { id: string; name: string; createdById: string };
    };
    expect(data.name).toBe('Apple');
    expect(data.createdById).toBe('mia');

    const listed = await app.request('/api/itam/master/manufacturers?q=app', {
      user: 'sam',
      role: 'support',
    });
    expect(listed.status).toBe(200);
    const list = (await listed.json()) as { data: unknown[]; total: number };
    expect(list.total).toBe(1);
    expect(list.data).toHaveLength(1);

    const updated = await app.request(
      `/api/itam/master/manufacturers/${data.id}`,
      {
        ...json({ supportPhone: '400-666' }),
        method: 'PATCH',
        user: 'mia',
        role: 'manager',
      },
    );
    expect(updated.status).toBe(200);
    expect(
      ((await updated.json()) as { data: { supportPhone: string } }).data
        .supportPhone,
    ).toBe('400-666');

    const changes = await app.request(
      `/api/itam/master/manufacturers/${data.id}/history?kind=changes`,
      { user: 'mia', role: 'manager' },
    );
    // One line per operation, each carrying that operation's field changes.
    const changeLog = (await changes.json()) as {
      data: { changes: { action: string; field: string | null }[] }[];
    };
    expect(
      changeLog.data.flatMap((item) =>
        item.changes.map((entry) => entry.action),
      ),
    ).toEqual(['update', 'create']);
    expect(changeLog.data[0]?.changes[0]?.field).toBe('supportPhone');

    // IT support keeps the reference data as well as using it, and may not
    // destroy any of it: deleting is one of the two things the role does
    // not do (the other is deciding a request).
    const supportUpdate = await app.request(
      `/api/itam/master/manufacturers/${data.id}`,
      {
        ...json({ supportPhone: '1' }),
        method: 'PATCH',
        user: 'sam',
        role: 'support',
      },
    );
    expect(supportUpdate.status).toBe(200);
    const supportDelete = await app.request(
      `/api/itam/master/manufacturers/${data.id}`,
      { method: 'DELETE', user: 'sam', role: 'support' },
    );
    expect(supportDelete.status).toBe(403);

    const deleted = await app.request(
      `/api/itam/master/manufacturers/${data.id}`,
      {
        method: 'DELETE',
        user: 'mia',
        role: 'manager',
      },
    );
    expect(deleted.status).toBe(200);
    const gone = await app.request(
      `/api/itam/master/manufacturers/${data.id}`,
      {
        user: 'mia',
        role: 'manager',
      },
    );
    expect(gone.status).toBe(404);
  });

  it('rejects invalid and duplicate input', async () => {
    const invalid = await app.request('/api/itam/master/manufacturers', {
      ...json({ website: 'x' }),
      user: 'mia',
      role: 'manager',
    });
    expect(invalid.status).toBe(400);

    const unknownField = await app.request('/api/itam/master/manufacturers', {
      ...json({ name: 'Dell', bogus: 1 }),
      user: 'mia',
      role: 'manager',
    });
    expect(unknownField.status).toBe(400);

    await app.request('/api/itam/master/manufacturers', {
      ...json({ name: 'Dell' }),
      user: 'mia',
      role: 'manager',
    });
    const duplicate = await app.request('/api/itam/master/manufacturers', {
      ...json({ name: 'Dell' }),
      user: 'mia',
      role: 'manager',
    });
    expect(duplicate.status).toBe(409);
    expect(((await duplicate.json()) as { code: string }).code).toBe(
      'DUPLICATE',
    );
  });

  it('filters models by the device type of their category', async () => {
    const create = async (collection: string, body: Record<string, unknown>) =>
      (
        (await (
          await app.request(`/api/itam/master/${collection}`, {
            ...json(body),
            user: 'mia',
            role: 'manager',
          })
        ).json()) as { data: { id: string } }
      ).data;
    const maker = await create('manufacturers', { name: 'Kind Maker' });
    const devices = await create('categories', {
      name: 'Devices',
      appliesTo: 'device',
    });
    const mice = await create('categories', {
      name: 'Mice',
      appliesTo: 'accessory',
    });
    await create('models', {
      name: 'Laptop model',
      categoryId: devices.id,
      manufacturerId: maker.id,
    });
    await create('models', {
      name: 'Mouse model',
      categoryId: mice.id,
      manufacturerId: maker.id,
    });
    const list = async (query: string) =>
      (
        (await (
          await app.request(`/api/itam/master/models?${query}`, {
            user: 'mia',
            role: 'manager',
          })
        ).json()) as { data: { name: string }[] }
      ).data.map((row) => row.name);
    expect(await list('filter[appliesTo]=accessory')).toEqual(['Mouse model']);
    expect(await list('filter[appliesTo]=entitlement')).toEqual([]);
    expect((await list('sort=manufacturerName')).length).toBe(2);
    // The category picker excludes software categories; the server refuses
    // one anyway.
    const software = await create('categories', {
      name: 'Apps',
      appliesTo: 'entitlement',
    });
    const refused = await app.request('/api/itam/master/models', {
      ...json({
        name: 'Not a model',
        categoryId: software.id,
        manufacturerId: maker.id,
      }),
      user: 'mia',
      role: 'manager',
    });
    expect(refused.status).toBe(422);
    expect(((await refused.json()) as { rule: string }).rule).toBe(
      'MODEL_CATEGORY_KIND',
    );
    const categories = (
      (await (
        await app.request(
          '/api/itam/master/categories?filter[appliesTo:ne]=entitlement',
          { user: 'mia', role: 'manager' },
        )
      ).json()) as { data: { name: string }[] }
    ).data.map((row) => row.name);
    expect(categories).toContain('Devices');
    expect(categories).not.toContain('Apps');
  });

  it('keeps names unique within their scope', async () => {
    const create = async (collection: string, body: Record<string, unknown>) =>
      app.request(`/api/itam/master/${collection}`, {
        ...json(body),
        user: 'mia',
        role: 'manager',
      });
    const data = async (response: Response) =>
      ((await response.json()) as { data: { id: string } }).data;
    // A model name repeats across manufacturers, not within one.
    const dell = await data(await create('manufacturers', { name: 'Dell U' }));
    const hp = await data(await create('manufacturers', { name: 'HP U' }));
    const devices = await data(
      await create('categories', { name: 'Devs U', appliesTo: 'device' }),
    );
    const first = await create('models', {
      name: 'Latitude',
      categoryId: devices.id,
      manufacturerId: dell.id,
    });
    expect(first.status).toBe(201);
    const same = await create('models', {
      name: 'Latitude',
      categoryId: devices.id,
      manufacturerId: dell.id,
    });
    expect(same.status).toBe(409);
    const other = await create('models', {
      name: 'Latitude',
      categoryId: devices.id,
      manufacturerId: hp.id,
    });
    expect(other.status).toBe(201);
    // A category name repeats under different parents, not among siblings.
    const root = await data(
      await create('categories', { name: 'Root U', appliesTo: 'device' }),
    );
    const child = await create('categories', {
      name: 'Printer',
      appliesTo: 'device',
      parentId: root.id,
    });
    expect(child.status).toBe(201);
    const sibling = await create('categories', {
      name: 'Printer',
      appliesTo: 'device',
      parentId: root.id,
    });
    expect(sibling.status).toBe(409);
    const elsewhere = await create('categories', {
      name: 'Printer',
      appliesTo: 'device',
      parentId: devices.id,
    });
    expect(elsewhere.status).toBe(201);
  });

  it('counts related records per software product for list columns', async () => {
    const create = async (collection: string, body: Record<string, unknown>) =>
      (
        (await (
          await app.request(`/api/itam/master/${collection}`, {
            ...json(body),
            user: 'mia',
            role: 'manager',
          })
        ).json()) as { data: { id: string } }
      ).data;
    const category = await create('categories', {
      name: 'Design tools',
      appliesTo: 'entitlement',
    });
    const product = await create('softwareProducts', {
      name: 'Counted product',
      categoryId: category.id,
      deliveryMethod: 'saas',
    });
    const license = await app.request('/api/itam/entitlements', {
      ...json({
        kind: 'perpetual',
        name: 'Counted license',
        softwareProductId: product.id,
        licensingModel: 'perUser',
        seatCount: 2,
      }),
      user: 'mia',
      role: 'manager',
    });
    expect(license.status).toBe(201);
    const counts = (await (
      await app.request('/api/itam/master/softwareProducts/counts', {
        user: 'mia',
        role: 'manager',
      })
    ).json()) as { data: Record<string, Record<string, number>> };
    expect(counts.data.entitlements?.[product.id]).toBe(1);
    const anonymous = await app.request(
      '/api/itam/master/softwareProducts/counts',
    );
    expect(anonymous.status).toBe(401);
  });

  it('blocks deleting a manufacturer that models reference', async () => {
    const manufacturer = (await (
      await app.request('/api/itam/master/manufacturers', {
        ...json({ name: 'Lenovo' }),
        user: 'mia',
        role: 'manager',
      })
    ).json()) as { data: { id: string } };
    const category = (await (
      await app.request('/api/itam/master/categories', {
        ...json({ name: 'Laptop', appliesTo: 'device' }),
        user: 'mia',
        role: 'manager',
      })
    ).json()) as { data: { id: string } };
    const model = await app.request('/api/itam/master/models', {
      ...json({
        name: 'ThinkPad T14',
        categoryId: category.data.id,
        manufacturerId: manufacturer.data.id,
      }),
      user: 'mia',
      role: 'manager',
    });
    expect(model.status).toBe(201);

    const impact = await app.request(
      `/api/itam/master/manufacturers/${manufacturer.data.id}/delete-impact`,
      { user: 'mia', role: 'manager' },
    );
    expect(
      ((await impact.json()) as { data: { level: string } }).data.level,
    ).toBe('blocked');

    const blocked = await app.request(
      `/api/itam/master/manufacturers/${manufacturer.data.id}`,
      {
        method: 'DELETE',
        user: 'mia',
        role: 'manager',
      },
    );
    expect(blocked.status).toBe(409);
    expect(((await blocked.json()) as { code: string }).code).toBe(
      'DELETE_BLOCKED',
    );
  });

  it('maintains location paths when moving a subtree', async () => {
    const create = async (body: Record<string, unknown>) =>
      (
        (await (
          await app.request('/api/itam/master/locations', {
            ...json(body),
            user: 'mia',
            role: 'manager',
          })
        ).json()) as { data: { id: string; path: string } }
      ).data;

    const hq = await create({ name: 'HQ', type: 'company' });
    const floor = await create({
      name: 'Floor 3',
      type: 'floor',
      parentId: hq.id,
    });
    const room = await create({
      name: 'Room 301',
      type: 'room',
      parentId: floor.id,
    });
    expect(room.path).toBe(`/${hq.id}/${floor.id}/${room.id}/`);

    const annex = await create({ name: 'Annex', type: 'building' });
    const moved = await app.request(`/api/itam/master/locations/${floor.id}`, {
      ...json({ parentId: annex.id }),
      method: 'PATCH',
      user: 'mia',
      role: 'manager',
    });
    expect(moved.status).toBe(200);
    const roomAfter = (await (
      await app.request(`/api/itam/master/locations/${room.id}`, {
        user: 'mia',
        role: 'manager',
      })
    ).json()) as { data: { path: string } };
    expect(roomAfter.data.path).toBe(`/${annex.id}/${floor.id}/${room.id}/`);

    const cycle = await app.request(`/api/itam/master/locations/${annex.id}`, {
      ...json({ parentId: room.id }),
      method: 'PATCH',
      user: 'mia',
      role: 'manager',
    });
    expect(cycle.status).toBe(400);
  });

  /**
   * The recovery plan a leaver's page reads. What is to be done with each
   * item is unit tested in `leaver-recovery-prepared.test.ts`; this is the
   * endpoint around it — who may read it, and that it answers for somebody
   * holding nothing rather than making the page guess.
   */
  it('answers what is still to be recovered from a person', async () => {
    const manager = { user: 'mia', role: 'manager' } as const;
    const department = (await (
      await app.request('/api/itam/master/departments', {
        ...json({ name: 'Support' }),
        ...manager,
      })
    ).json()) as { data: { id: string } };
    const person = (await (
      await app.request('/api/itam/master/people', {
        ...json({
          name: 'Nobody',
          departmentId: department.data.id,
          leaveDate: '2020-01-01',
        }),
        ...manager,
      })
    ).json()) as { data: { id: string } };
    const response = await app.request(
      `/api/itam/master/people/${person.data.id}/recovery`,
      manager,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        name: 'Nobody',
        // A date in the past, so the status follows it.
        employmentStatus: 'left',
        leaveDate: '2020-01-01',
        items: [],
        // They held nothing when they left, so there is nothing settled
        // either — and no snapshot was taken, for the same reason, which is
        // why no progress is claimed.
        settled: [],
        settledOwned: [],
        progress: null,
        // Nobody signs in as them, so no record can name them — and there
        // is no sign-in to remind anybody to disable.
        owned: [],
        account: null,
      },
    });
    expect(
      (await app.request(`/api/itam/master/people/${person.data.id}/recovery`))
        .status,
    ).toBe(401);
    expect(
      (
        await app.request(
          `/api/itam/master/people/${person.data.id}/recovery`,
          { user: 'eve', role: 'employee' },
        )
      ).status,
    ).toBe(403);
    expect(
      (await app.request('/api/itam/master/people/999999/recovery', manager))
        .status,
    ).toBe(404);
  });

  /**
   * Leaving marks a person, not an account: a leaver's sign-in still works
   * until somebody disables it. The recovery says which sign-in it is,
   * whether it still works, and whether this reader may disable it — the
   * page reminds them, or names who can.
   */
  it('reports whether a leaver can still sign in', async () => {
    const manager = { user: 'mia', role: 'manager' } as const;
    let disabledAt: Date | null = null;
    app.container.instance(userAdministrationServiceToken, {
      get: async (id: string) =>
        id === 'zhou'
          ? {
              id,
              name: 'Zhou Yi',
              username: 'zhou.yi',
              email: 'zhou@example.com',
              emailVerified: true,
              disabledAt,
              createdAt: new Date(),
              updatedAt: new Date(),
            }
          : undefined,
    } as never);
    const department = (await (
      await app.request('/api/itam/master/departments', {
        ...json({ name: 'IT' }),
        ...manager,
      })
    ).json()) as { data: { id: string } };
    const person = (await (
      await app.request('/api/itam/master/people', {
        ...json({
          name: 'Zhou Yi',
          departmentId: department.data.id,
          leaveDate: '2020-01-01',
          userId: 'zhou',
        }),
        ...manager,
      })
    ).json()) as { data: { id: string } };
    const accountOf = async () =>
      (
        (await (
          await app.request(
            `/api/itam/master/people/${person.data.id}/recovery`,
            manager,
          )
        ).json()) as { data: { account: unknown } }
      ).data.account;

    expect(await accountOf()).toEqual({
      name: 'Zhou Yi',
      username: 'zhou.yi',
      disabled: false,
      // Nothing disabled it: no users plugin is registered here to do it.
      disabledOnLeaving: false,
      // The asset manager administers the register, not the platform's
      // accounts — the users page is root's — so the page names who can
      // rather than offering a page this reader cannot open.
      canDisable: false,
    });
    disabledAt = new Date();
    expect(await accountOf()).toMatchObject({ disabled: true });
  });

  /**
   * A stocktake is handed over by its 负责人, like every other record that
   * still names somebody. Being one of its executors is not answering for
   * it: the people who count come and go while it runs, and the owner, who
   * is still here, is who notices when one of them leaves — so a task the
   * leaver only counts on is not theirs to hand over. A closed task keeps
   * the owner it had.
   */
  it('lists a stocktake the leaver answers for, not one they only count on', async () => {
    const manager = { user: 'mia', role: 'manager' } as const;
    const department = (await (
      await app.request('/api/itam/master/departments', {
        ...json({ name: 'IT' }),
        ...manager,
      })
    ).json()) as { data: { id: string } };
    const person = (await (
      await app.request('/api/itam/master/people', {
        ...json({
          name: 'Zhou Yi',
          departmentId: department.data.id,
          leaveDate: '2020-01-01',
          userId: 'mia',
        }),
        ...manager,
      })
    ).json()) as { data: { id: string } };
    const task = async (name: string, ownerId: string, executorIds: string[]) =>
      (
        (await (
          await app.request('/api/itam/audits', {
            ...json({
              name,
              scope: { departmentIds: [department.data.id] },
              plannedStart: '2026-10-01',
              plannedEnd: '2026-10-20',
              ownerId,
              executorIds,
            }),
            ...manager,
          })
        ).json()) as { data: { id: string } }
      ).data;
    const theirs = await task('Warehouse count', 'mia', ['mia', 'sam']);
    // Counted on by the leaver, answered for by somebody who stays.
    await task('Floor count', 'sam', ['mia']);
    const closed = await task('Last year', 'mia', ['mia']);
    await app.request(`/api/itam/audits/${closed.id}/start`, {
      ...json({}),
      ...manager,
    });
    await app.request(`/api/itam/audits/${closed.id}/cancel`, {
      ...json({ reason: 'Superseded' }),
      ...manager,
    });

    const recoveryOf = async () =>
      (
        (await (
          await app.request(
            `/api/itam/master/people/${person.data.id}/recovery`,
            manager,
          )
        ).json()) as {
          data: { owned: { collection: string; id: string }[] };
        }
      ).data.owned;
    expect(await recoveryOf()).toEqual([
      {
        collection: 'auditTasks',
        id: theirs.id,
        label: 'Warehouse count',
        field: 'ownerId',
        ownerId: 'mia',
      },
    ]);

    // Handed over the way every record is: the field set to somebody else.
    expect(
      (
        await app.request(`/api/itam/audits/${theirs.id}`, {
          ...json({ ownerId: 'sam' }),
          method: 'PATCH',
          ...manager,
        })
      ).status,
    ).toBe(200);
    expect(await recoveryOf()).toEqual([]);
  });

  /**
   * The other half of a recovery: what still names them. It reaches them
   * through their sign-in rather than their person record, which is why a
   * person with no linked account owns nothing — the case above.
   */
  it('lists the records a leaver still answers for', async () => {
    const manager = { user: 'mia', role: 'manager' } as const;
    const department = (await (
      await app.request('/api/itam/master/departments', {
        ...json({ name: 'IT' }),
        ...manager,
      })
    ).json()) as { data: { id: string } };
    const person = (await (
      await app.request('/api/itam/master/people', {
        ...json({
          name: 'Zhou Yi',
          departmentId: department.data.id,
          leaveDate: '2020-01-01',
          // The sign-in they had while they worked here.
          userId: 'mia',
        }),
        ...manager,
      })
    ).json()) as { data: { id: string } };
    // A joiner they were getting equipped: theirs to hand over.
    await app.request('/api/itam/master/people', {
      ...json({
        name: 'New Joiner',
        departmentId: department.data.id,
        hireDate: addDays(today(), 5),
        onboardingOwnerId: 'mia',
      }),
      ...manager,
    });
    const recovery = (await (
      await app.request(
        `/api/itam/master/people/${person.data.id}/recovery`,
        manager,
      )
    ).json()) as { data: { owned: { collection: string; label: string }[] } };
    expect(recovery.data.owned).toEqual([
      {
        collection: 'people',
        id: expect.any(String),
        label: 'New Joiner',
        // Which field names them, so the page can hand it over without
        // keeping a second copy of the map, and who holds it now, so the
        // handover row says whose it is before it is reassigned.
        field: 'onboardingOwnerId',
        ownerId: 'mia',
      },
    ]);
  });

  it("counts a tree node's descendants' people and sorts by several fields", async () => {
    const manager = { user: 'mia', role: 'manager' } as const;
    const create = async (collection: string, body: Record<string, unknown>) =>
      (
        (await (
          await app.request(`/api/itam/master/${collection}`, {
            ...json(body),
            ...manager,
          })
        ).json()) as { data: { id: string } }
      ).data;
    const tech = await create('departments', { name: 'Tech' });
    const rd = await create('departments', { name: 'R&D', parentId: tech.id });
    await create('people', {
      name: 'Joiner',
      employeeNo: 'E1',
      departmentId: rd.id,
      hireDate: addDays(today(), 5),
    });
    await create('people', {
      name: 'Head',
      employeeNo: 'E3',
      departmentId: tech.id,
    });
    await create('people', {
      name: 'Engineer',
      employeeNo: 'E2',
      departmentId: rd.id,
    });
    await create('people', {
      name: 'Gone',
      employeeNo: 'E0',
      departmentId: rd.id,
      leaveDate: '2020-01-01',
    });

    const stats = (await (
      await app.request(
        `/api/itam/master/departments/${tech.id}/stats`,
        manager,
      )
    ).json()) as { data: { counts: Record<string, number> } };
    // Everybody not gone, R&D's included; its children stay its own.
    expect(stats.data.counts.people).toBe(3);
    expect(stats.data.counts.children).toBe(1);

    // A location the same way.
    const site = await create('locations', { name: 'Site', type: 'building' });
    const floor = await create('locations', {
      name: 'Floor',
      type: 'floor',
      parentId: site.id,
    });
    const ops = await create('departments', { name: 'Ops' });
    await create('people', {
      name: 'Upstairs',
      departmentId: ops.id,
      locationId: floor.id,
    });
    await create('people', {
      name: 'Left',
      departmentId: ops.id,
      locationId: floor.id,
      leaveDate: '2020-01-01',
    });
    const place = (await (
      await app.request(`/api/itam/master/locations/${site.id}/stats`, manager)
    ).json()) as { data: { counts: Record<string, number> } };
    expect(place.data.counts.people).toBe(1);
    expect(place.data.counts.children).toBe(1);

    const list = (await (
      await app.request(
        `/api/itam/master/people?sort=employmentStatus,employeeNo&filter[departmentId]=${tech.id}&filter[departmentId]=${rd.id}&filter[employmentStatus]=active&filter[employmentStatus]=pending`,
        manager,
      )
    ).json()) as { data: { name: string }[] };
    // 在职 before 待入职, each by employee number.
    expect(list.data.map((row) => row.name)).toEqual([
      'Engineer',
      'Head',
      'Joiner',
    ]);
  });

  it("reports a record's footprint and ancestors", async () => {
    const manager = { user: 'mia', role: 'manager' } as const;
    const create = async (collection: string, body: Record<string, unknown>) =>
      (
        (await (
          await app.request(`/api/itam/master/${collection}`, {
            ...json(body),
            ...manager,
          })
        ).json()) as { data: { id: string } }
      ).data;
    const hardware = await create('categories', {
      name: 'Hardware',
      appliesTo: 'device',
    });
    const laptop = await create('categories', {
      name: 'Laptop',
      appliesTo: 'device',
      parentId: hardware.id,
    });
    await create('categories', {
      name: 'Gaming laptop',
      appliesTo: 'device',
      parentId: laptop.id,
    });
    const apple = await create('manufacturers', { name: 'Apple' });
    await create('models', {
      name: 'MacBook Pro',
      categoryId: laptop.id,
      manufacturerId: apple.id,
    });
    await create('models', {
      name: 'MacBook Air',
      categoryId: laptop.id,
      manufacturerId: apple.id,
    });

    const stats = (await (
      await app.request(
        `/api/itam/master/categories/${laptop.id}/stats`,
        manager,
      )
    ).json()) as {
      data: {
        counts: Record<string, number>;
        devicesByStatus: Record<string, number>;
        ancestors: { id: string; name: string }[];
      };
    };
    expect(stats.data.counts.models).toBe(2);
    expect(stats.data.counts.children).toBe(1);
    expect(stats.data.devicesByStatus).toEqual({});
    expect(stats.data.ancestors.map((entry) => entry.name)).toEqual([
      'Hardware',
    ]);
    // A parent counts its sub-categories' models; its children stay its own.
    const parent = (await (
      await app.request(
        `/api/itam/master/categories/${hardware.id}/stats`,
        manager,
      )
    ).json()) as { data: { counts: Record<string, number> } };
    expect(parent.data.counts.models).toBe(2);
    expect(parent.data.counts.children).toBe(1);

    // What a category applies to is fixed while records use it.
    const retarget = await app.request(
      `/api/itam/master/categories/${laptop.id}`,
      { ...json({ appliesTo: 'consumable' }), method: 'PATCH', ...manager },
    );
    expect(retarget.status).toBe(422);
    expect(((await retarget.json()) as { rule: string }).rule).toBe(
      'CATEGORY_IN_USE',
    );
    // The root is refused too: its subtree holds those models.
    const rootRetarget = await app.request(
      `/api/itam/master/categories/${hardware.id}`,
      { ...json({ appliesTo: 'consumable' }), method: 'PATCH', ...manager },
    );
    expect(rootRetarget.status).toBe(422);

    // Drag and drop: a node lands under a parent at an index; siblings renumber.
    const desktop = await create('categories', {
      name: 'Desktop',
      appliesTo: 'device',
      parentId: hardware.id,
    });
    const moved = await app.request(
      `/api/itam/master/categories/${desktop.id}/move`,
      {
        ...json({ parentId: hardware.id, index: 0 }),
        ...manager,
      },
    );
    expect(moved.status).toBe(200);
    const ordered = (await (
      await app.request(
        '/api/itam/master/categories?sort=sort&filter[parentId]=' + hardware.id,
        manager,
      )
    ).json()) as { data: { name: string; sort: number }[] };
    expect(ordered.data.map((row) => row.name)).toEqual(['Desktop', 'Laptop']);
    expect(ordered.data.map((row) => row.sort)).toEqual([10, 20]);
    const toRoot = await app.request(
      `/api/itam/master/categories/${desktop.id}/move`,
      { ...json({ parentId: null, index: 1 }), ...manager },
    );
    expect(toRoot.status).toBe(200);
    const roots = (await (
      await app.request(
        '/api/itam/master/categories?sort=sort&filter[parentId]=null',
        manager,
      )
    ).json()) as { data: { name: string }[] };
    expect(roots.data.map((row) => row.name)).toEqual(['Hardware', 'Desktop']);
    // A sub-category shares its parent's device type: it cannot be moved
    // under a parent of another type, nor have the type edited itself.
    const stockRoot = await create('categories', {
      name: 'Stock',
      appliesTo: 'accessory',
    });
    const crossMove = await app.request(
      `/api/itam/master/categories/${laptop.id}/move`,
      { ...json({ parentId: stockRoot.id, index: 0 }), ...manager },
    );
    expect(crossMove.status).toBe(422);
    expect(((await crossMove.json()) as { rule: string }).rule).toBe(
      'CATEGORY_TYPE_MISMATCH',
    );
    const childType = await app.request(
      `/api/itam/master/categories/${laptop.id}`,
      { ...json({ appliesTo: 'accessory' }), method: 'PATCH', ...manager },
    );
    expect(childType.status).toBe(422);
    const inherited = await create('categories', {
      name: 'Inherits',
      parentId: stockRoot.id,
      appliesTo: 'device',
    });
    // Retyping a root flows down to its children when nothing uses them.
    const emptyRoot = await create('categories', {
      name: 'Empty root',
      appliesTo: 'consumable',
    });
    const emptyChild = await create('categories', {
      name: 'Empty child',
      parentId: emptyRoot.id,
      appliesTo: 'consumable',
    });
    const retyped = await app.request(
      `/api/itam/master/categories/${emptyRoot.id}`,
      { ...json({ appliesTo: 'component' }), method: 'PATCH', ...manager },
    );
    expect(retyped.status).toBe(200);
    const childRow = (await (
      await app.request(`/api/itam/master/categories/${emptyChild.id}`, manager)
    ).json()) as { data: { appliesTo: string } };
    expect(childRow.data.appliesTo).toBe('component');
    const inheritedRow = (await (
      await app.request(`/api/itam/master/categories/${inherited.id}`, manager)
    ).json()) as { data: { appliesTo: string } };
    expect(inheritedRow.data.appliesTo).toBe('accessory');
    const selfMove = await app.request(
      `/api/itam/master/categories/${hardware.id}/move`,
      { ...json({ parentId: laptop.id, index: 0 }), ...manager },
    );
    expect(selfMove.status).toBe(400);

    // Moving an ancestor under its own descendant is refused (no path column).
    const cycle = await app.request(
      `/api/itam/master/categories/${hardware.id}`,
      { ...json({ parentId: laptop.id }), method: 'PATCH', ...manager },
    );
    expect(cycle.status).toBe(400);

    const denied = await app.request(
      `/api/itam/master/categories/${laptop.id}/stats`,
      { user: 'eve', role: 'employee' },
    );
    expect(denied.status).toBe(403);
    const missing = await app.request(
      '/api/itam/master/categories/nope/stats',
      manager,
    );
    expect(missing.status).toBe(404);
  });
});
