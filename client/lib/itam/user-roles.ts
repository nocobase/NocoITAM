import type { ItamRecord } from './api.js';

/** A permission set an account holds, as the user directory returns it. */
interface UserRole {
  readonly key: string;
  readonly title: string;
}

/** The directories whose rows are people and carry their `roles`. */
const PEOPLE_DIRECTORIES: ReadonlySet<string> = new Set([
  'users',
  'approvers',
  'repairOwners',
]);

/** This application's own sets, which the locales name in every language. */
const KNOWN_ROLES: ReadonlySet<string> = new Set([
  'itam-asset-manager',
  'itam-it-support',
]);

/**
 * The names of the permission sets a picked person holds — IT 资产经理,
 * IT 支持 — joined for the line beside their name. A set an administrator
 * made reads by its own title.
 */
export function userRolesLabel(
  collection: string,
  row: ItamRecord,
  t: (key: string, options?: { defaultValue?: string }) => string,
): string {
  if (!PEOPLE_DIRECTORIES.has(collection) || !Array.isArray(row.roles))
    return '';
  return (row.roles as readonly UserRole[])
    .map((role) =>
      KNOWN_ROLES.has(role.key)
        ? t(`users.roles.${role.key}`, { defaultValue: role.title })
        : role.title,
    )
    .filter(Boolean)
    .join(' · ');
}
