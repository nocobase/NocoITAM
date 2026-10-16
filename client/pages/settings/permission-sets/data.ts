// The Permission sets pages' data: the authorization plugin's client, the
// catalog of what can be granted (`permissionSets/options`), with the
// Pages section filled from the application's route tree as the plugin
// leaves to the application, a set's capabilities under its protection,
// and how a failed write reads.
import {
  useAuthorizationClient,
  type AuthorizationOptionsResponse,
  type PermissionGrant,
  type PermissionSet,
  type PermissionSetAssignment,
} from '@nocobase/app-plugin-authorization/client';
import {
  compareNavigationOrder,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useRouteTree } from '../../../routing/route-context.js';
import {
  errorReason,
  errorStatus,
  useAdminQueryKey,
  useCanMany,
} from '../hooks.js';

export const SETTINGS_ID = 'authorization.permission-sets';
const SURFACE = 'permissionSets';

export function usePermissionSetsKey(): readonly string[] {
  const base = useAdminQueryKey();
  return useMemo(() => [...base, 'permissionSets'], [base]);
}

export interface PermissionSetsOutletContext {
  readonly reload: () => void;
}

export function useMembersKey(setKey: string): readonly string[] {
  const base = usePermissionSetsKey();
  return useMemo(() => [...base, 'members', setKey], [base, setKey]);
}

/** What the Members drawer passes its Add members dialog. */
export interface MembersOutletContext {
  readonly set: PermissionSet;
  readonly members: readonly PermissionSetAssignment[];
  readonly reloadMembers: () => void;
}

/** A set's members with their names (the assignments, and the users they name, resolved). */
export function useMembers(setKey: string) {
  const authz = useAuthorizationClient();
  const key = useMembersKey(setKey);
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const assignments = await authz.listAssignments(setKey);
      const userIds = assignments
        .filter((item) => item.subject.type === 'user')
        .map((item) => item.subject.id);
      const users =
        userIds.length > 0
          ? await authz.resolveSubjects('permissionSets', 'user', userIds)
          : [];
      return { assignments, users };
    },
    retry: false,
  });
}

export function usePermissionSets() {
  const authz = useAuthorizationClient();
  const key = usePermissionSetsKey();
  return useQuery({
    queryKey: [...key, 'list'],
    queryFn: () => authz.listPermissionSets(),
    retry: false,
  });
}

export function usePermissionSet(setKey: string) {
  const authz = useAuthorizationClient();
  const key = usePermissionSetsKey();
  return useQuery({
    queryKey: [...key, 'one', setKey],
    queryFn: () => authz.getPermissionSet(setKey),
    retry: false,
  });
}

export function useOptions() {
  const authz = useAuthorizationClient();
  const key = usePermissionSetsKey();
  return useQuery({
    queryKey: [...key, 'options'],
    queryFn: () => authz.loadOptions(SURFACE),
    staleTime: 60_000,
    retry: false,
  });
}

/** What the reader may do with the sets page, and with one set under its protection. */
export function useSetActions(): (
  action: 'create' | 'update' | 'delete' | 'assign',
  set?: PermissionSet,
) => boolean {
  const can = useCanMany();
  return (action, set) => {
    if (!can({ resource: { type: 'settings', id: SETTINGS_ID }, action }))
      return false;
    if (!set) return true;
    if (action === 'update' && set.unrestricted) return false;
    const allow = set.protection?.allow;
    if (!allow) return true;
    return action === 'assign'
      ? allow.includes('assign')
      : action === 'create'
        ? true
        : allow.includes(action);
  };
}

/** Whether members may be removed from the set (`revoke` under its protection). */
export function canRevoke(set: PermissionSet): boolean {
  return (
    set.protection === undefined || set.protection.allow.includes('revoke')
  );
}

/** A set's title in the current language, else its key. */
export function useSetTitle(): (
  set: Pick<PermissionSet, 'key' | 'title'>,
) => string {
  const { t } = useTranslation();
  return (set) =>
    set.title === undefined
      ? set.key
      : typeof set.title === 'string'
        ? set.title
        : t(set.title.key, { ns: set.title.ns, defaultValue: set.key });
}

/** One page offered for a page grant: the menu's title, under the menu group it sits in. */
export interface GrantablePage {
  readonly id: string;
  readonly label: string;
  readonly group?: { readonly id: string; readonly label: string };
}

/**
 * The application's pages that take a page grant (`authz` of type page, action `access`), in menu order, grouped by
 * the menu-only group above them. The server lists no page; it accepts any id, so the client offers what its routes
 * declare.
 */
export function useGrantablePages(): readonly GrantablePage[] {
  const routes = useRouteTree();
  const { t } = useTranslation();
  return useMemo(() => {
    const label = (route: AppClientRegisteredRoute): string => {
      const title =
        route.navigation?.title ?? route.breadcrumb?.title ?? route.name;
      return t(title, { ns: route.packageName, defaultValue: title });
    };
    const seen = new Set<string>();
    const pages: GrantablePage[] = [];
    const walk = (
      list: readonly AppClientRegisteredRoute[],
      group: GrantablePage['group'],
    ): void => {
      for (const route of [...list].sort(compareNavigationOrder)) {
        const authz = route.authz;
        if (
          route.componentLoader &&
          typeof authz === 'object' &&
          authz.resource.type === 'page' &&
          authz.action === 'access' &&
          !seen.has(authz.resource.id)
        ) {
          seen.add(authz.resource.id);
          const named = t(`admin.sets.pages.${authz.resource.id}`, {
            defaultValue: '',
          });
          pages.push({
            id: authz.resource.id,
            label:
              named || (route.navigation ? label(route) : authz.resource.id),
            ...(group ? { group } : {}),
          });
        }
        const childGroup =
          !route.componentLoader && route.navigation
            ? { id: route.name, label: label(route) }
            : group;
        walk(route.children ?? [], childGroup);
      }
    };
    walk(routes, undefined);
    return pages;
  }, [routes, t]);
}

export type Options = AuthorizationOptionsResponse;

/** A failed set or assignment write as one sentence; field errors are the dialogs' own. */
export function setFailure(
  error: unknown,
  text: (key: string) => string,
): string {
  const reason = errorReason(error);
  if (reason === 'PROTECTED_PERMISSION_SET')
    return text('sets.errors.protected');
  if (reason === 'LAST_ASSIGNMENT') return text('sets.errors.lastAssignment');
  if (reason === 'PERMISSION_SET_SUBJECT_NOT_ALLOWED')
    return text('sets.errors.subjectNotAllowed');
  const status = errorStatus(error);
  if (status === 404) return text('common.notFound');
  if (status === 0) return text('common.network');
  if (status === 401) return text('common.sessionEnded');
  return text('common.failed');
}

/** Grants in a stable form, for telling whether two versions of a set differ. */
export function grantsSignature(grants: readonly PermissionGrant[]): string {
  return JSON.stringify(
    [...grants]
      .map((grant) => ({
        resource: `${grant.resource.type}:${grant.resource.id}`,
        actions: [...grant.actions]
          .map((action) => ({
            action: action.action,
            policy: action.policy ?? null,
          }))
          .sort((a, b) => a.action.localeCompare(b.action)),
      }))
      .filter((grant) => grant.actions.length > 0)
      .sort((a, b) => a.resource.localeCompare(b.resource)),
  );
}
