// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server/tokens';
import { masterDataServiceToken } from '../../server/providers/itam/master-data.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };

/**
 * A leaver's sign-in goes with them: leaving disables it and revokes its
 * sessions, coming back re-enables only what leaving disabled, and what the
 * platform refuses — the last administrator — stays as it was, for the page
 * to remind about. The users plugin is faked at its management service,
 * which is the layer that carries that refusal.
 */
describe('a leaver’s sign-in', () => {
  let app: TestApp;
  const disabled = new Set<string>();
  const revoked: string[] = [];
  const refused = new Set<string>();

  beforeEach(async () => {
    disabled.clear();
    revoked.length = 0;
    refused.clear();
    app = await createTestApp();
    await app.mount(masterDataRoutes);
    const account = (id: string) => ({
      id,
      name: id,
      username: id,
      email: `${id}@example.com`,
      emailVerified: true,
      disabledAt: disabled.has(id) ? new Date() : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    app.container.instance(userAdministrationServiceToken, {
      get: async (id: string) => account(id),
    } as never);
    app.container.instance(userManagementServiceToken, {
      disable: async (id: string) => {
        if (refused.has(id)) throw new Error('PermissionSetLastAssignment');
        disabled.add(id);
        return account(id);
      },
      enable: async (id: string) => {
        disabled.delete(id);
        return account(id);
      },
      revokeSessions: async (id: string) => {
        revoked.push(id);
      },
    } as never);
  });

  afterEach(async () => {
    await app.destroy();
  });

  const person = async (userId: string, leaveDate?: string) => {
    const department = (await (
      await app.request('/api/itam/master/departments', {
        ...json({ name: `IT ${userId}` }),
        ...manager,
      })
    ).json()) as { data: { id: string } };
    return (
      (await (
        await app.request('/api/itam/master/people', {
          ...json({
            name: userId,
            departmentId: department.data.id,
            userId,
            ...(leaveDate ? { leaveDate } : {}),
          }),
          ...manager,
        })
      ).json()) as { data: { id: string } }
    ).data;
  };
  const account = async (id: string) =>
    (
      (await (
        await app.request(`/api/itam/master/people/${id}/recovery`, manager)
      ).json()) as { data: { account: Record<string, unknown> } }
    ).data.account;
  const markLeft = (id: string, who = manager) =>
    app.request(`/api/itam/master/people/${id}/mark-left`, {
      ...json({}),
      ...who,
    });

  it('disables the sign-in on leaving, and says it was leaving that did', async () => {
    const zhou = await person('zhou');
    expect((await markLeft(zhou.id)).status).toBe(200);
    expect(disabled.has('zhou')).toBe(true);
    // A browser already signed in stops too.
    expect(revoked).toEqual(['zhou']);
    expect(await account(zhou.id)).toMatchObject({
      disabled: true,
      disabledOnLeaving: true,
    });
  });

  it('disables it when a leave date that has passed is entered, and restores it when moved out', async () => {
    const zhou = await person('zhou');
    await app.request(`/api/itam/master/people/${zhou.id}`, {
      ...json({ leaveDate: '2020-01-01' }),
      method: 'PATCH',
      ...manager,
    });
    expect(disabled.has('zhou')).toBe(true);
    // The notice period extended: the leave is undone, and so is what it did.
    await app.request(`/api/itam/master/people/${zhou.id}`, {
      ...json({ leaveDate: '2099-01-01' }),
      method: 'PATCH',
      ...manager,
    });
    expect(disabled.has('zhou')).toBe(false);
  });

  it('disables it when the nightly job reaches the leave date, and restores it when the date moves', async () => {
    await person('zhou', '2099-06-01');
    const people = app.container.resolve(masterDataServiceToken);
    // The day comes round: the job marks them as left, without an actor.
    await people.markDueLeavers('2099-06-01');
    expect(disabled.has('zhou')).toBe(true);
    // Seen from a day before it — as when the date is moved out again —
    // the job puts them back, and the sign-in with them.
    await people.markDueLeavers('2099-01-01');
    expect(disabled.has('zhou')).toBe(false);
  });

  it('leaves alone an account the platform will not disable, for the page to remind about', async () => {
    const root = await person('root-admin');
    refused.add('root-admin');
    expect((await markLeft(root.id)).status).toBe(200);
    expect(disabled.has('root-admin')).toBe(false);
    expect(await account(root.id)).toMatchObject({
      disabled: false,
      disabledOnLeaving: false,
    });
  });

  it("never disables the reader's own sign-in", async () => {
    const mia = await person('mia');
    await markLeft(mia.id);
    expect(disabled.has('mia')).toBe(false);
  });

  it('does not re-enable an account somebody disabled for a reason of their own', async () => {
    const zhou = await person('zhou');
    // Disabled by an administrator before anybody marked them as left.
    disabled.add('zhou');
    await app.request(`/api/itam/master/people/${zhou.id}`, {
      ...json({ leaveDate: '2020-01-01' }),
      method: 'PATCH',
      ...manager,
    });
    await app.request(`/api/itam/master/people/${zhou.id}`, {
      ...json({ leaveDate: '2099-01-01' }),
      method: 'PATCH',
      ...manager,
    });
    expect(disabled.has('zhou')).toBe(true);
    // And it was not leaving that disabled it.
    expect(await account(zhou.id)).toMatchObject({ disabledOnLeaving: false });
  });
});
