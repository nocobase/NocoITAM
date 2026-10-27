import { expect, it } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../server/standalone.js';

type Assignment = {
  subjectType: unknown;
  subjectId: unknown;
  permissionSetKey: unknown;
};

function unexpectedGlobalAssignments(
  assignments: readonly Assignment[],
): Assignment[] {
  return assignments.filter((assignment) => assignment.subjectId === '*');
}

const test = createAppTest({
  createServer: createStandaloneServer,
  connections: ['main'],
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  },
});

test('initialization does not silently grant business roles to every signed-in user', async ({
  connection,
}) => {
  const assignments = await connection.query
    .selectFrom('authorizationPermissionSetAssignments')
    .select(['subjectType', 'subjectId', 'permissionSetKey'])
    .execute();
  expect(
    unexpectedGlobalAssignments(assignments),
    'Global role assignments must be explicitly requested and editable in administration. Use per-user role assignments by default; do not remove this guard to make a feature accessible.',
  ).toEqual([]);
  const member = await connection.query
    .selectFrom('authorizationPermissionSets')
    .select(['grants'])
    .where('key', '=', 'member')
    .executeTakeFirstOrThrow();
  let grants: unknown = member.grants;
  // Database JSON codecs may preserve the serialized seed value as a string.
  while (typeof grants === 'string') grants = JSON.parse(grants) as unknown;
  expect(
    grants,
    'The inherited platform member role must not conceal application business grants. Assign a separate business role to explicit users.',
  ).toEqual([]);
  // The initial administrator holds 资产管理员 beside root (2026-10-23), an
  // explicit per-user assignment, so pickers can offer the one account a
  // fresh deployment has.
  const admin = await connection.query
    .selectFrom('user')
    .select('id')
    .where('username', '=', 'nocobase')
    .executeTakeFirstOrThrow();
  const held = assignments
    .filter(
      (assignment) =>
        assignment.subjectType === 'user' &&
        assignment.subjectId === String(admin.id),
    )
    .map((assignment) => assignment.permissionSetKey);
  expect(held).toEqual(expect.arrayContaining(['root', 'itam-asset-manager']));
});

test('uses explicit Member defaults without restoring removed roles or granting roleless business access', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const create = async (email: string, roleScopes?: { app: string[] }) => {
    const response = await admin.fetch('/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({
        name: 'Role behavior test',
        email,
        password: 'isolated-test-password',
        ...(roleScopes ? { roleScopes } : {}),
      }),
    });
    expect(
      response.status,
      `Create user response: ${await response.clone().text()}`,
    ).toBe(201);
    return (await response.json()).data;
  };
  const member = await create('member-test@example.test');
  expect(member.roleScopes.app).toEqual(['member']);
  const empty = await create('roleless-test@example.test', { app: [] });
  expect(empty.roleScopes.app).toEqual([]);
  const removed = await admin.fetch(`/users/${member.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({ roleScopes: { app: [] } }),
  });
  expect(removed.status).toBe(200);
  const updated = await admin.fetch(`/users/${member.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({ name: 'Still roleless' }),
  });
  expect(updated.status).toBe(200);
  expect((await updated.json()).data.roleScopes.app).toEqual([]);
  const person = await signIn(testApp, {
    email: 'member-test@example.test',
    password: 'isolated-test-password',
  });
  expect((await person.fetch('/auth/get-session')).status).toBe(200);
  expect((await person.fetch('/itam/devices')).status).toBe(403);
});

it('detects wildcard recipients regardless of the role name, while preserving explicit user assignments', () => {
  const global = {
    subjectType: 'authenticated',
    subjectId: '*',
    permissionSetKey: 'task-member',
  };
  expect(
    unexpectedGlobalAssignments([
      {
        subjectType: 'authenticated',
        subjectId: '*',
        permissionSetKey: 'member',
      },
      {
        subjectType: 'user',
        subjectId: 'user-1',
        permissionSetKey: 'task-member',
      },
      global,
      { ...global, subjectType: 'everyone' },
    ]),
  ).toEqual([
    {
      subjectType: 'authenticated',
      subjectId: '*',
      permissionSetKey: 'member',
    },
    global,
    { ...global, subjectType: 'everyone' },
  ]);
});
