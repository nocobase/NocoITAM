import { defineSeed, type SeedDefinition } from '@nocobase/db';

const ASSET_MANAGER = 'itam-asset-manager';

/**
 * The initial administrator also holds 资产管理员 (2026-10-23). `root`
 * already permits everything, but a role is also who the register offers:
 * approver and 负责人 pickers list the accounts holding an `itam.*`
 * operation, which `root` grants none of, so without this the one account
 * a fresh deployment has could never be asked to approve or answer for a
 * record. The demo granted it only while imported; this keeps it.
 *
 * Found the way the authorization plugin's own seed finds that account for
 * `root` (`users.initialAdmin.username`), with the assignment id it uses.
 * Once, as a seed: an administrator who removes the assignment later keeps
 * it removed. Nothing is written when either the account or the set is
 * missing, or when the users and authorization tables are not there.
 */
const seed: SeedDefinition = defineSeed({
  name: '202610230001_assign_initial_admin_asset_manager',

  async run({ query, config, connection }) {
    const client = await connection.client<TableSchemaClient>();
    for (const table of ['user', 'authorization_permission_set_assignments'])
      if (!(await client.schema.hasTable(table))) return;
    const username =
      config.get<string>('users.initialAdmin.username') ?? 'nocobase';
    const user = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', username.toLowerCase())
      .limit(1)
      .executeTakeFirst();
    if (!user) return;
    const set = await query
      .selectFrom('authorizationPermissionSets')
      .select('key')
      .where('key', '=', ASSET_MANAGER)
      .executeTakeFirst();
    if (!set) return;
    const userId = String(user.id);
    const held = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .where('subjectType', '=', 'user')
      .where('subjectId', '=', userId)
      .where('permissionSetKey', '=', ASSET_MANAGER)
      .executeTakeFirst();
    if (held) return;
    const now = new Date();
    await query
      .insertInto('authorizationPermissionSetAssignments')
      .values({
        id: `user:${userId}:${ASSET_MANAGER}`,
        subjectType: 'user',
        subjectId: userId,
        permissionSetKey: ASSET_MANAGER,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  },
});

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

export default seed;
