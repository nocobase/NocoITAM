// A permission set's grants as the Permissions tab edits them: which
// action of which resource is on, and, for a data-scoped business action,
// how far it reaches. Pure functions over `PermissionGrant[]`, so a draft is
// an ordinary array the save sends whole; grants on resources the catalog
// no longer lists pass through untouched.
import type { PermissionGrant } from '@nocobase/app-plugin-authorization/client';

type Policy = NonNullable<PermissionGrant['actions'][number]['policy']>;

export interface DataScope {
  readonly key: string;
  readonly recordAccess: readonly string[];
  readonly defaultValue?: string;
}

function grantOf(
  grants: readonly PermissionGrant[],
  type: string,
  id: string,
): PermissionGrant | undefined {
  return grants.find(
    (grant) => grant.resource.type === type && grant.resource.id === id,
  );
}

export function isOn(
  grants: readonly PermissionGrant[],
  type: string,
  id: string,
  action: string,
): boolean {
  return Boolean(
    grantOf(grants, type, id)?.actions.some((item) => item.action === action),
  );
}

/** The record access a data-scoped action reaches: its stored value, else the scope's default. */
export function levelOf(
  grants: readonly PermissionGrant[],
  type: string,
  id: string,
  action: string,
  scope: DataScope,
): string {
  const policy = grantOf(grants, type, id)?.actions.find(
    (item) => item.action === action,
  )?.policy;
  const scopes = policy?.type === 'composite' ? policy.scopes : undefined;
  const value =
    scopes && typeof scopes === 'object'
      ? (scopes as Record<string, unknown>)[scope.key]
      : undefined;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'key' in value)
    return String(value.key);
  return scope.defaultValue ?? scope.recordAccess[0] ?? '';
}

function withGrant(
  grants: readonly PermissionGrant[],
  type: string,
  id: string,
  change: (actions: PermissionGrant['actions']) => PermissionGrant['actions'],
): PermissionGrant[] {
  const existing = grantOf(grants, type, id);
  const actions = change(existing?.actions ?? []);
  const rest = grants.filter((grant) => grant !== existing);
  return actions.length === 0
    ? rest
    : existing
      ? grants.map((grant) =>
          grant === existing ? { ...grant, actions } : grant,
        )
      : [...rest, { resource: { type, id }, actions }];
}

/** Turns an action on (with its data scope at the scope's default) or off. */
export function toggle(
  grants: readonly PermissionGrant[],
  type: string,
  id: string,
  action: string,
  on: boolean,
  scope?: DataScope,
): PermissionGrant[] {
  return withGrant(grants, type, id, (actions) => {
    const others = actions.filter((item) => item.action !== action);
    if (!on) return others;
    const policy: Policy | undefined = scope
      ? {
          type: 'composite',
          scopes: { [scope.key]: scope.defaultValue ?? scope.recordAccess[0] },
        }
      : undefined;
    return [...others, policy ? { action, policy } : { action }];
  });
}

/** Sets how far a data-scoped action reaches, keeping whatever else its policy holds. */
export function setLevel(
  grants: readonly PermissionGrant[],
  type: string,
  id: string,
  action: string,
  scope: DataScope,
  level: string,
): PermissionGrant[] {
  return withGrant(grants, type, id, (actions) =>
    actions.map((item) => {
      if (item.action !== action) return item;
      const policy =
        item.policy?.type === 'composite' ? item.policy : undefined;
      const scopes =
        policy && policy.scopes && typeof policy.scopes === 'object'
          ? (policy.scopes as Record<string, unknown>)
          : {};
      return {
        ...item,
        policy: {
          ...(policy ?? {}),
          type: 'composite',
          scopes: { ...scopes, [scope.key]: level },
        },
      };
    }),
  );
}
