// Settings → Users: the accounts that can sign in, with their roles,
// paged by the server; create, invite, edit, change roles, reset a
// password, sign out everywhere, disable, enable and delete. Built on the
// users plugin's API (`UsersClient`), which checks every `user` action
// itself; the page offers only what the reader holds.
import { useToaster } from '@nocobase/app-client';
import type { ManagedUser } from '@nocobase/app-plugin-users/client/user-client';
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  BanIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  KeyRoundIcon,
  LogOutIcon,
  MailPlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
  Trash2Icon,
  UserCheckIcon,
} from 'lucide-react';
import { useMemo, useRef, useState, type ReactElement } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { useUrlSearch } from '#hooks/use-url-search';
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';
import { Spinner } from '#components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';

import {
  ConfirmAction,
  LoadFailure,
  TableSkeleton,
  TruncatedText,
} from '../shared.js';
import {
  errorReason,
  errorStatus,
  useAdminText,
  useFailureText,
} from '../hooks.js';
import {
  useUsersKey,
  rolesOf,
  useRoleLabel,
  useRoleScope,
  useSelfId,
  useUserActions,
  useUsersClient,
  type UsersOutletContext,
} from './data.js';
import { Invitations } from './invitations.js';

const PAGE_SIZE = 20;
const STATUSES = ['enabled', 'disabled'] as const;
const SELECT_CONTENT =
  'w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal';

type Confirmation = 'signOut' | 'disable' | 'delete';

export default function UsersPage(): ReactElement {
  const { text } = useAdminText();
  const client = useUsersClient();
  const queryClient = useQueryClient();
  const usersKey = useUsersKey();
  const toaster = useToaster();
  const failureText = useFailureText();
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);
  const selfId = useSelfId();
  const can = useUserActions();
  const roleLabel = useRoleLabel();
  const {
    scope,
    isLoading: rolesLoading,
    error: rolesError,
    retry: retryRoles,
  } = useRoleScope();

  const {
    searchParams,
    search,
    text: searchText,
    inputProps,
    updateParams,
    clear,
  } = useUrlSearch({ resetParams: ['page'] });
  const statusParam = searchParams.get('status');
  const status = STATUSES.find((value) => value === statusParam);
  const role = searchParams.get('role') ?? undefined;
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const hasFilters =
    searchText.trim() !== '' || status !== undefined || role !== undefined;

  const query = useQuery({
    queryKey: [...usersKey, 'list', { search, status, role, page }],
    queryFn: () =>
      client.list({
        page,
        pageSize: PAGE_SIZE,
        q: search || undefined,
        status,
        ...(role && scope ? { roleScope: scope.key, role } : {}),
      }),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const result = query.data;
  const rows = result?.items;
  const pages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;

  function setFilter(name: string, value: string | null): void {
    updateParams((params) => {
      if (value && value !== 'all') params.set(name, value);
      else params.delete(name);
      params.delete('page');
    });
  }
  function clearFilters(): void {
    clear((params) => {
      params.delete('status');
      params.delete('role');
      params.delete('page');
    });
    searchRef.current?.focus();
  }
  function goToPage(next: number): void {
    updateParams((params) => {
      if (next > 1) params.set('page', String(next));
      else params.delete('page');
    });
  }

  const reload = (): void => {
    void queryClient.invalidateQueries({ queryKey: usersKey });
  };
  const outletContext = useMemo<UsersOutletContext>(
    () => ({
      reload: () => void queryClient.invalidateQueries({ queryKey: usersKey }),
    }),
    [queryClient, usersKey],
  );

  // The confirmation keeps its user after closing, so its title does not
  // go blank while it animates out.
  const [confirmation, setConfirmation] = useState<{
    readonly open: boolean;
    readonly kind: Confirmation;
    readonly user: ManagedUser | null;
  }>({ open: false, kind: 'delete', user: null });
  const [enabling, setEnabling] = useState<string>();

  async function runConfirmation(): Promise<void> {
    const { kind, user } = confirmation;
    if (!user) return;
    if (kind === 'signOut') await client.revokeSessions(user.id);
    else if (kind === 'disable') await client.disable(user.id);
    else await client.remove(user.id);
    toaster.show({
      type: 'success',
      title: text(
        kind === 'signOut'
          ? 'users.toasts.signedOut'
          : kind === 'disable'
            ? 'users.toasts.disabled'
            : 'users.toasts.deleted',
        { name: user.name },
      ),
    });
    reload();
  }

  function enable(user: ManagedUser): void {
    setEnabling(user.id);
    client
      .enable(user.id)
      .then(
        () =>
          toaster.show({
            type: 'success',
            title: text('users.toasts.enabled', { name: user.name }),
          }),
        (error: unknown) => {
          toaster.show({ type: 'error', title: failureText(error) });
        },
      )
      .finally(() => {
        setEnabling(undefined);
        reload();
      });
  }

  // A refusal the role scope or the plugin explains.
  function confirmationFailure(error: unknown): string | undefined {
    const reason = errorReason(error);
    if (reason === 'SELF_DELETE_NOT_ALLOWED') return text('users.errors.self');
    if (errorStatus(error) === 400 && confirmation.kind === 'delete')
      return text('users.errors.holdsRecords');
    if (errorStatus(error) === 400 && confirmation.kind === 'disable')
      return text('users.errors.lastAdministratorDisable');
    return undefined;
  }

  const link = (pathname: string) => ({ pathname, search: location.search });
  const canCreate = can('create') && can('assign-role');
  const roleItems = [
    { value: 'all', label: text('users.roleAll') },
    ...(scope?.options ?? []).map((option) => ({
      value: option.value,
      label: roleLabel(option),
    })),
  ];
  const statusItems = [
    { value: 'all', label: text('users.status.all') },
    ...STATUSES.map((value) => ({
      value,
      label: text(`users.status.${value}`),
    })),
  ];

  let content: ReactElement;
  if (query.error && !rows) {
    content = (
      <LoadFailure
        error={query.error}
        what={text('users.what')}
        onRetry={() => void query.refetch()}
      />
    );
  } else if (!rows || !result) {
    content = <TableSkeleton columns={5} />;
  } else if (rows.length === 0) {
    // The reader is a user, so the list is never empty without a filter.
    content = (
      <div className='flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground'>
        <span>{text('users.noResults')}</span>
        <Button variant='link' onClick={clearFilters}>
          {text('common.clearFilters')}
        </Button>
      </div>
    );
  } else {
    const from = (result.page - 1) * result.pageSize + 1;
    const to = from + rows.length - 1;
    content = (
      <div className='flex flex-col gap-3'>
        <div className='overflow-x-auto rounded-lg border border-border bg-card shadow-xs'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{text('users.columns.name')}</TableHead>
                <TableHead>{text('users.columns.username')}</TableHead>
                <TableHead>{text('users.columns.email')}</TableHead>
                <TableHead>{text('users.columns.roles')}</TableHead>
                <TableHead>{text('users.columns.status')}</TableHead>
                <TableHead>
                  <span className='sr-only'>{text('common.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((user) => {
                const self = user.id === selfId;
                const disabled = user.disabledAt !== null;
                // Without the role options (loading, or failed), the stored values stand as they are.
                const held = scope
                  ? rolesOf(user, scope)
                  : Object.values(user.roleScopes).flatMap((value) =>
                      typeof value === 'string' ? [value] : [...value],
                    );
                return (
                  <TableRow key={user.id}>
                    <TableCell className='max-w-64'>
                      <span className='flex min-w-0 items-center gap-2'>
                        <TruncatedText className='font-medium'>
                          {user.name}
                        </TruncatedText>
                        {self ? (
                          <Badge variant='muted'>{text('users.you')}</Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className='max-w-48 text-muted-foreground'>
                      {user.username ? (
                        <TruncatedText>{user.username}</TruncatedText>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className='max-w-64'>
                      <TruncatedText>{user.email}</TruncatedText>
                    </TableCell>
                    <TableCell>
                      <span className='flex flex-wrap gap-1'>
                        {!scope && rolesLoading ? (
                          <Skeleton className='h-5 w-24' />
                        ) : held.length === 0 ? (
                          <span className='text-muted-foreground'>
                            {text('users.noRoles')}
                          </span>
                        ) : (
                          held.map((value) => {
                            const option = scope?.options.find(
                              (item) => item.value === value,
                            );
                            return (
                              <Badge key={value} variant='muted'>
                                {option ? roleLabel(option) : value}
                              </Badge>
                            );
                          })
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={disabled ? 'warning' : 'success'}>
                        {text(
                          disabled
                            ? 'users.status.disabled'
                            : 'users.status.enabled',
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className='w-0 text-right'>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant='ghost'
                              size='icon-sm'
                              aria-label={text('common.actionsFor', {
                                name: user.name,
                              })}
                              disabled={enabling === user.id}
                            />
                          }
                        >
                          {enabling === user.id ? (
                            <Spinner />
                          ) : (
                            <MoreHorizontalIcon />
                          )}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align='end'
                          className='w-auto min-w-40'
                        >
                          <DropdownMenuGroup>
                            {can('update') ? (
                              <DropdownMenuItem
                                render={
                                  <Link
                                    to={link(
                                      `${encodeURIComponent(user.id)}/edit`,
                                    )}
                                  />
                                }
                              >
                                <PencilIcon />
                                {text('users.actions.edit')}
                              </DropdownMenuItem>
                            ) : null}
                            {can('assign-role') ? (
                              <DropdownMenuItem
                                render={
                                  <Link
                                    to={link(
                                      `${encodeURIComponent(user.id)}/roles`,
                                    )}
                                  />
                                }
                              >
                                <ShieldIcon />
                                {text('users.actions.roles')}
                              </DropdownMenuItem>
                            ) : null}
                            {can('reset-password') ? (
                              <DropdownMenuItem
                                render={
                                  <Link
                                    to={link(
                                      `${encodeURIComponent(user.id)}/password`,
                                    )}
                                  />
                                }
                              >
                                <KeyRoundIcon />
                                {text('users.actions.password')}
                              </DropdownMenuItem>
                            ) : null}
                            {disabled && can('enable') ? (
                              <DropdownMenuItem onClick={() => enable(user)}>
                                <UserCheckIcon />
                                {text('users.actions.enable')}
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuGroup>
                          {(can('revoke-sessions') && !disabled) ||
                          (!self && !disabled && can('disable')) ||
                          (!self && can('delete')) ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuGroup>
                                {can('revoke-sessions') && !disabled ? (
                                  <DropdownMenuItem
                                    variant='destructive'
                                    onClick={() =>
                                      setConfirmation({
                                        open: true,
                                        kind: 'signOut',
                                        user,
                                      })
                                    }
                                  >
                                    <LogOutIcon />
                                    {text('users.actions.signOut')}
                                  </DropdownMenuItem>
                                ) : null}
                                {!self && !disabled && can('disable') ? (
                                  <DropdownMenuItem
                                    variant='destructive'
                                    onClick={() =>
                                      setConfirmation({
                                        open: true,
                                        kind: 'disable',
                                        user,
                                      })
                                    }
                                  >
                                    <BanIcon />
                                    {text('users.actions.disable')}
                                  </DropdownMenuItem>
                                ) : null}
                                {!self && can('delete') ? (
                                  <DropdownMenuItem
                                    variant='destructive'
                                    onClick={() =>
                                      setConfirmation({
                                        open: true,
                                        kind: 'delete',
                                        user,
                                      })
                                    }
                                  >
                                    <Trash2Icon />
                                    {text('users.actions.delete')}
                                  </DropdownMenuItem>
                                ) : null}
                              </DropdownMenuGroup>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <nav
          aria-label={text('users.pagination')}
          className='flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground'
        >
          <span>{text('users.range', { from, to, total: result.total })}</span>
          {pages > 1 ? (
            <span className='flex items-center gap-2'>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant='outline'
                      size='icon-sm'
                      aria-label={text('common.previous')}
                      disabled={page <= 1}
                      onClick={() => goToPage(page - 1)}
                    />
                  }
                >
                  <ChevronLeftIcon />
                </TooltipTrigger>
                <TooltipContent>{text('common.previous')}</TooltipContent>
              </Tooltip>
              <span className='tabular-nums'>
                {text('common.pageOf', { page, pages })}
              </span>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant='outline'
                      size='icon-sm'
                      aria-label={text('common.next')}
                      disabled={page >= pages}
                      onClick={() => goToPage(page + 1)}
                    />
                  }
                >
                  <ChevronRightIcon />
                </TooltipTrigger>
                <TooltipContent>{text('common.next')}</TooltipContent>
              </Tooltip>
            </span>
          ) : null}
        </nav>
      </div>
    );
  }

  const target = confirmation.user?.name ?? '';
  return (
    <PageContainer>
      <PageHeader
        title={text('users.title')}
        description={text('users.description')}
        actions={
          <>
            {can('invite') ? (
              <Button
                variant='outline'
                nativeButton={false}
                render={<Link to={link('invite')} />}
              >
                <MailPlusIcon data-icon='inline-start' />
                {text('users.invite')}
              </Button>
            ) : null}
            {canCreate ? (
              <Button nativeButton={false} render={<Link to={link('new')} />}>
                <PlusIcon data-icon='inline-start' />
                {text('users.new')}
              </Button>
            ) : null}
          </>
        }
      />
      <div className='flex flex-wrap items-center gap-2'>
        <InputGroup className='w-full sm:max-w-xs'>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            {...inputProps}
            placeholder={text('users.search')}
            aria-label={text('users.search')}
          />
        </InputGroup>
        <Select
          items={statusItems}
          value={status ?? 'all'}
          onValueChange={(value) => setFilter('status', value)}
        >
          <SelectTrigger
            className='w-full sm:w-40'
            aria-label={text('users.statusFilter')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={SELECT_CONTENT}>
            <SelectGroup>
              {statusItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {scope ? (
          <Select
            items={roleItems}
            value={role ?? 'all'}
            onValueChange={(value) => setFilter('role', value)}
          >
            <SelectTrigger
              className='w-full sm:w-40'
              aria-label={text('users.roleFilter')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={SELECT_CONTENT}>
              <SelectGroup>
                {roleItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : null}
        {hasFilters ? (
          <Button variant='ghost' onClick={clearFilters}>
            {text('common.clearFilters')}
          </Button>
        ) : null}
        {query.isFetching && rows ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {rolesError && !scope ? (
        <LoadFailure
          error={rolesError}
          what={text('users.fields.roles')}
          onRetry={retryRoles}
        />
      ) : null}
      {content}
      {can('invite') ? <Invitations /> : null}

      <ConfirmAction
        onGone={reload}
        open={confirmation.open}
        onOpenChange={(open) =>
          setConfirmation((current) => ({ ...current, open }))
        }
        destructive
        title={text(
          confirmation.kind === 'signOut'
            ? 'users.confirm.signOutTitle'
            : confirmation.kind === 'disable'
              ? 'users.confirm.disableTitle'
              : 'users.confirm.deleteTitle',
          { name: target },
        )}
        description={text(
          confirmation.kind === 'signOut'
            ? 'users.confirm.signOutBody'
            : confirmation.kind === 'disable'
              ? 'users.confirm.disableBody'
              : 'users.confirm.deleteBody',
        )}
        confirmLabel={text(
          confirmation.kind === 'signOut'
            ? 'users.confirm.signOut'
            : confirmation.kind === 'disable'
              ? 'users.actions.disable'
              : 'users.actions.delete',
        )}
        onConfirm={runConfirmation}
        failure={confirmationFailure}
        finalFocus={() =>
          confirmation.kind === 'delete' ? searchRef.current : null
        }
      />
      <Outlet context={outletContext} />
    </PageContainer>
  );
}
