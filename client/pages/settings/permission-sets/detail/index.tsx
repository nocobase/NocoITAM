// A permission set's own page (/settings/permission-sets/:setKey), covering
// the list: its name and key, Rename and Delete in the header, and two
// tabs, its permissions and its members. The header's trail leads back to
// the list with its search, so there is no back button (guideline L6).
import { usePageBreadcrumb, useToaster } from '@nocobase/app-client';
import { useAuthorizationClient } from '@nocobase/app-plugin-authorization/client';
import { useQueryClient } from '@tanstack/react-query';
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  Link,
  Navigate,
  Outlet,
  matchPath,
  useLocation,
  useNavigate,
  useParams,
  useResolvedPath,
} from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { RouteChildPage } from '#components/route-child-page';
import { ToneBadge as Badge } from '@/components/settings/tone-badge';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { Skeleton } from '#components/ui/skeleton';

import { ConfirmAction, LoadFailure, RouteTabs } from '../../shared.js';
import { useAdminText } from '../../hooks.js';
import {
  setFailure,
  useMembers,
  usePermissionSet,
  usePermissionSetsKey,
  useSetActions,
  useSetTitle,
  type PermissionSetPageContext,
} from '../data.js';

const TABS = ['permissions', 'members'] as const;

export default function PermissionSetPage(): ReactElement {
  const { text } = useAdminText();
  const { setKey = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const own = useResolvedPath('.');
  const authz = useAuthorizationClient();
  const toaster = useToaster();
  const queryClient = useQueryClient();
  const setsKey = usePermissionSetsKey();
  const title = useSetTitle();
  const can = useSetActions();
  const set = usePermissionSet(setKey);
  const name = set.data ? title(set.data) : undefined;
  const listPath = own.pathname.replace(/\/[^/]+$/u, '');

  usePageBreadcrumb(
    useMemo(
      () =>
        name === undefined
          ? undefined
          : [
              {
                label: text('sets.title'),
                to: { pathname: listPath, search: location.search },
              },
              { label: name },
            ],
      [name, listPath, location.search, text],
    ),
  );

  const tab = TABS.find((candidate) =>
    matchPath(
      { path: `${own.pathname}/${candidate}`, end: false },
      location.pathname,
    ),
  );
  const members = useMembers(setKey);
  // The page's own navigation passes the Permissions tab's unsaved-changes guard once: a flag set by the handlers
  // and read and cleared by the guard, never while rendering.
  const allowedRef = useRef(false);
  const allowNavigation = useCallback(() => {
    allowedRef.current = true;
  }, []);
  const consumeAllowedNavigation = useCallback(() => {
    const allowed = allowedRef.current;
    allowedRef.current = false;
    return allowed;
  }, []);
  const context = useMemo<PermissionSetPageContext | undefined>(
    () =>
      set.data
        ? {
            set: set.data,
            reload: () =>
              void queryClient.invalidateQueries({ queryKey: setsKey }),
            allowNavigation,
            consumeAllowedNavigation,
          }
        : undefined,
    [set.data, queryClient, setsKey, allowNavigation, consumeAllowedNavigation],
  );
  const [deleting, setDeleting] = useState(false);

  // The page's own URL opens its first tab, keeping the list's search.
  if (location.pathname.replace(/\/$/u, '') === own.pathname)
    return (
      <Navigate
        to={{ pathname: 'permissions', search: location.search }}
        replace
      />
    );

  let body: ReactElement;
  if (set.error && !set.data) {
    body = (
      <LoadFailure
        error={set.error}
        what={text('sets.whatOne')}
        onRetry={() => void set.refetch()}
        back={{
          to: listPath + location.search,
          label: text('common.backToList'),
        }}
      />
    );
  } else if (!set.data || name === undefined) {
    body = (
      <div
        role='status'
        aria-label={text('common.loading')}
        className='flex flex-col gap-4'
      >
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-48 w-full' />
      </div>
    );
  } else {
    const rename = can('update', set.data) && !set.data.unrestricted;
    const remove = can('delete', set.data);
    body = (
      <>
        <PageHeader
          title={name}
          description={
            <span className='flex flex-wrap items-center gap-2'>
              <code className='font-mono text-xs'>{set.data.key}</code>
              {set.data.unrestricted ? (
                <Badge variant='info'>{text('sets.kinds.unrestricted')}</Badge>
              ) : set.data.protection ? (
                <Badge variant='muted'>{text('sets.kinds.builtIn')}</Badge>
              ) : null}
            </span>
          }
          actions={
            <>
              {rename && tab ? (
                <Button
                  variant='outline'
                  nativeButton={false}
                  render={
                    <Link
                      to={{ pathname: `${tab}/edit`, search: location.search }}
                      onClick={allowNavigation}
                    />
                  }
                >
                  <PencilIcon data-icon='inline-start' />
                  {text('sets.rename')}
                </Button>
              ) : null}
              {remove ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant='outline'
                        size='icon'
                        aria-label={text('sets.more')}
                      />
                    }
                  >
                    <MoreHorizontalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end' className='w-auto min-w-40'>
                    <DropdownMenuItem
                      variant='destructive'
                      onClick={() => setDeleting(true)}
                    >
                      <Trash2Icon />
                      {text('sets.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </>
          }
        />
        <RouteTabs
          label={name}
          tabs={TABS.map((candidate) => ({
            to: { pathname: candidate, search: location.search },
            label: text(`sets.tabs.${candidate}`),
            active: tab === candidate,
            ...(candidate === 'members' && members.data
              ? { count: members.data.assignments.length }
              : {}),
          }))}
        />
        <Outlet context={context} />
        <ConfirmAction
          onGone={() =>
            void queryClient.invalidateQueries({ queryKey: setsKey })
          }
          open={deleting}
          onOpenChange={setDeleting}
          destructive
          title={text('sets.confirm.deleteTitle', { name })}
          description={text('sets.confirm.deleteBody')}
          confirmLabel={text('sets.delete')}
          onConfirm={async () => {
            await authz.deletePermissionSet(setKey);
            authz.invalidate();
            toaster.show({
              type: 'success',
              title: text('sets.toasts.deleted', { name }),
            });
            void queryClient.invalidateQueries({ queryKey: setsKey });
            allowNavigation();
            void navigate(
              { pathname: listPath, search: location.search },
              { replace: true },
            );
          }}
          failure={(error) => setFailure(error, text)}
          // This page and its delete button are gone: focus lands on the list's heading (A6).
          finalFocus={() => document.getElementById('permission-sets-title')}
        />
      </>
    );
  }

  return (
    <RouteChildPage>
      <PageContainer>{body}</PageContainer>
    </RouteChildPage>
  );
}
