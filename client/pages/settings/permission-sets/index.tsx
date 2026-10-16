// Settings → Permission sets: the roles people hold. Each row opens the
// set's permissions and its members in drawers over the list
// (detail/permissions.tsx, detail/members.tsx); a set is
// created, renamed and deleted here. Built on the authorization plugin's
// `/api/authorization/permissionSets`, which checks the settings item
// `authorization.permission-sets` for every call.
import { useAuthorizationClient } from '@nocobase/app-plugin-authorization/client';
import type { PermissionSet } from '@nocobase/app-plugin-authorization/client';
import { useToaster } from '@nocobase/app-client';
import { useQueryClient } from '@tanstack/react-query';
import {
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UsersRoundIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Link, Outlet, useLocation, useResolvedPath } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { ToneBadge as Badge } from '@/components/settings/tone-badge';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import { SortableHead } from '../../../components/settings/sortable-table.js';
import {
  ConfirmAction,
  LoadFailure,
  TableSkeleton,
  TruncatedText,
} from '../shared.js';
import { useAdminText } from '../hooks.js';
import {
  setFailure,
  usePermissionSets,
  usePermissionSetsKey,
  useSetActions,
  useSetTitle,
  type PermissionSetsOutletContext,
} from './data.js';

export default function PermissionSetsPage(): ReactElement {
  const { text, language } = useAdminText();
  const authz = useAuthorizationClient();
  const toaster = useToaster();
  const queryClient = useQueryClient();
  const setsKey = usePermissionSetsKey();
  const location = useLocation();
  const titleRef = useRef<HTMLDivElement>(null);
  const sets = usePermissionSets();
  const title = useSetTitle();
  const can = useSetActions();
  // By name in the current language, A first; a click reverses it.
  const [ascending, setAscending] = useState(true);
  const collator = useMemo(() => new Intl.Collator(language), [language]);
  const rows = useMemo(
    () =>
      [...(sets.data ?? [])].sort(
        (a, b) => collator.compare(title(a), title(b)) * (ascending ? 1 : -1),
      ),
    [sets.data, collator, title, ascending],
  );
  const reload = (): void =>
    void queryClient.invalidateQueries({ queryKey: setsKey });
  const outletContext = useMemo<PermissionSetsOutletContext>(
    () => ({
      reload: () => void queryClient.invalidateQueries({ queryKey: setsKey }),
    }),
    [queryClient, setsKey],
  );
  const [deletion, setDeletion] = useState<{
    readonly open: boolean;
    readonly set: PermissionSet | null;
  }>({ open: false, set: null });
  const link = (pathname: string) => ({ pathname, search: location.search });
  // A drawer opened by its address has no opener to give focus back to, nor
  // has one left by "Back to the list": focus lands on the list's title
  // rather than the page (guideline A6).
  const own = useResolvedPath('.');
  const atList = location.pathname.replace(/\/$/u, '') === own.pathname;
  const wasAtListRef = useRef(atList);
  useEffect(() => {
    const returned = atList && !wasAtListRef.current;
    wasAtListRef.current = atList;
    if (!returned) return;
    const timer = window.setTimeout(() => {
      if (document.activeElement === document.body) titleRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [atList]);

  let content: ReactElement;
  if (sets.error && !sets.data) {
    content = (
      <LoadFailure
        error={sets.error}
        what={text('sets.what')}
        onRetry={reload}
      />
    );
  } else if (!sets.data) {
    content = <TableSkeleton columns={3} />;
  } else {
    content = (
      <div className='overflow-x-auto rounded-lg border border-border bg-card shadow-xs'>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead
                title={text('sets.columns.name')}
                direction={ascending ? 'asc' : 'desc'}
                onClick={() => setAscending((current) => !current)}
              />
              <TableHead>{text('sets.columns.key')}</TableHead>
              <TableHead>{text('sets.columns.kind')}</TableHead>
              <TableHead>
                <span className='sr-only'>{text('common.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((set) => {
              const name = title(set);
              const rename = can('update', set) && !set.unrestricted;
              const remove = can('delete', set);
              return (
                <TableRow key={set.key}>
                  <TableCell className='max-w-72'>
                    <Link
                      to={link(
                        `${encodeURIComponent(set.key)}/permissions/pages`,
                      )}
                      className='block font-medium underline-offset-4 hover:underline'
                    >
                      <TruncatedText>{name}</TruncatedText>
                    </Link>
                  </TableCell>
                  <TableCell className='max-w-56'>
                    <TruncatedText className='font-mono text-xs text-muted-foreground'>
                      {set.key}
                    </TruncatedText>
                  </TableCell>
                  <TableCell>
                    {set.unrestricted ? (
                      <Badge variant='info'>
                        {text('sets.kinds.unrestricted')}
                      </Badge>
                    ) : set.protection ? (
                      <Badge variant='muted'>
                        {text('sets.kinds.builtIn')}
                      </Badge>
                    ) : (
                      <span className='text-muted-foreground'>—</span>
                    )}
                  </TableCell>
                  <TableCell className='w-0 text-right'>
                    <div className='flex items-center justify-end gap-1'>
                      {/* The set's two views, each a drawer over the list. */}
                      <Button
                        variant='ghost'
                        size='sm'
                        nativeButton={false}
                        aria-label={text('sets.permissionsOf', { name })}
                        render={
                          <Link
                            to={link(
                              `${encodeURIComponent(set.key)}/permissions/pages`,
                            )}
                          />
                        }
                      >
                        <ShieldCheckIcon data-icon='inline-start' />
                        {text('sets.openPermissions')}
                      </Button>
                      <Button
                        variant='ghost'
                        size='sm'
                        nativeButton={false}
                        aria-label={text('sets.membersOf', { name })}
                        render={
                          <Link
                            to={link(`${encodeURIComponent(set.key)}/members`)}
                          />
                        }
                      >
                        <UsersRoundIcon data-icon='inline-start' />
                        {text('sets.openMembers')}
                      </Button>
                      {rename || remove ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant='ghost'
                                size='icon-sm'
                                aria-label={text('common.actionsFor', { name })}
                              />
                            }
                          >
                            <MoreHorizontalIcon />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align='end'
                            className='w-auto min-w-40'
                          >
                            {rename ? (
                              <DropdownMenuGroup>
                                <DropdownMenuItem
                                  render={
                                    <Link
                                      to={link(
                                        `edit/${encodeURIComponent(set.key)}`,
                                      )}
                                    />
                                  }
                                >
                                  <PencilIcon />
                                  {text('sets.rename')}
                                </DropdownMenuItem>
                              </DropdownMenuGroup>
                            ) : null}
                            {rename && remove ? (
                              <DropdownMenuSeparator />
                            ) : null}
                            {remove ? (
                              <DropdownMenuGroup>
                                <DropdownMenuItem
                                  variant='destructive'
                                  onClick={() =>
                                    setDeletion({ open: true, set })
                                  }
                                >
                                  <Trash2Icon />
                                  {text('sets.delete')}
                                </DropdownMenuItem>
                              </DropdownMenuGroup>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        // The menu's room, so the buttons line up row to row.
                        <span aria-hidden className='size-7 shrink-0' />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }

  const target = deletion.set ? title(deletion.set) : '';
  return (
    <PageContainer>
      <div
        id='permission-sets-title'
        ref={titleRef}
        tabIndex={-1}
        className='outline-none'
      >
        <PageHeader
          title={text('sets.title')}
          description={text('sets.description')}
          actions={
            sets.data && can('create') ? (
              <Button nativeButton={false} render={<Link to={link('new')} />}>
                <PlusIcon data-icon='inline-start' />
                {text('sets.new')}
              </Button>
            ) : null
          }
        />
      </div>
      {content}
      <ConfirmAction
        onGone={reload}
        open={deletion.open}
        onOpenChange={(open) =>
          setDeletion((current) => ({ ...current, open }))
        }
        destructive
        title={text('sets.confirm.deleteTitle', { name: target })}
        description={text('sets.confirm.deleteBody')}
        confirmLabel={text('sets.delete')}
        onConfirm={async () => {
          if (!deletion.set) return;
          await authz.deletePermissionSet(deletion.set.key);
          authz.invalidate();
          toaster.show({
            type: 'success',
            title: text('sets.toasts.deleted', { name: target }),
          });
          reload();
        }}
        failure={(error) => setFailure(error, text)}
        finalFocus={() => titleRef.current}
      />
      <Outlet context={outletContext} />
    </PageContainer>
  );
}
