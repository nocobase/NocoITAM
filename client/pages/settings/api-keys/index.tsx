// Settings → API keys: the signed-in person's own keys (`/api/apiKeys`,
// which answers for the caller alone), created with an optional scope and
// an expiry, rotated and deleted here. A key's secret is shown once, when
// it is created or rotated. Every signed-in person may open the page;
// whether they may create keys is `mayCreate` of the scope options.
import { useApiClient, useToaster } from '@nocobase/app-client';
import type {
  ApiKeyView,
  CreatedApiKey,
  KeyScopeOptions,
} from '@nocobase/app-plugin-api-keys/shared/scopes';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  KeyRoundIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCwIcon,
  Trash2Icon,
} from 'lucide-react';
import { useMemo, useRef, useState, type ReactElement } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { ToneBadge as Badge } from '@/components/settings/tone-badge';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';

import { SortableHead } from '../../../components/settings/sortable-table.js';
import {
  ConfirmAction,
  CopyField,
  LoadFailure,
  TableSkeleton,
  TruncatedText,
} from '../common/shared.js';
import {
  useAdminQueryKey,
  useAdminText,
  useDateTime,
} from '../common/hooks.js';

export interface ApiKeysOutletContext {
  readonly scopeOptions: KeyScopeOptions | undefined;
  /** Why the scope options did not load, and a way to try again. */
  readonly scopeError: unknown;
  readonly retryScope: () => void;
  /** The list refreshes behind the new key's secret. */
  readonly created: () => void;
}

type SortColumn = 'name' | 'created' | 'expires' | 'lastUsed';

export default function ApiKeysPage(): ReactElement {
  const { text, language } = useAdminText();
  const api = useApiClient();
  const toaster = useToaster();
  const queryClient = useQueryClient();
  const location = useLocation();
  const formatDate = useDateTime();
  // When the page opened, to mark the keys already expired.
  const [now] = useState(() => Date.now());
  const titleRef = useRef<HTMLDivElement>(null);
  const adminKey = useAdminQueryKey();
  const keysKey = useMemo(() => [...adminKey, 'apiKeys'], [adminKey]);

  const keys = useQuery({
    queryKey: keysKey,
    queryFn: () =>
      api
        .request<{ data: ApiKeyView[] }>({ path: 'apiKeys' })
        .then((result) => result.data),
    retry: false,
  });
  const options = useQuery({
    queryKey: [...keysKey, 'scopeOptions'],
    queryFn: () =>
      api
        .request<{ data: KeyScopeOptions }>({ path: 'apiKeys/scopeOptions' })
        .then((result) => result.data),
    retry: false,
  });
  const mayCreate =
    options.data?.mayCreate !== false && options.data !== undefined;

  const [sort, setSort] = useState<{
    readonly column: SortColumn;
    readonly direction: 'asc' | 'desc';
  }>({ column: 'created', direction: 'desc' });
  const collator = useMemo(() => new Intl.Collator(language), [language]);
  const rows = useMemo(() => {
    const list = [...(keys.data ?? [])];
    const value = (key: ApiKeyView): string | number | undefined =>
      sort.column === 'name'
        ? (key.name ?? undefined)
        : sort.column === 'created'
          ? Date.parse(key.createdAt)
          : sort.column === 'expires'
            ? key.expiresAt
              ? Date.parse(key.expiresAt)
              : undefined
            : key.lastUsedAt
              ? Date.parse(key.lastUsedAt)
              : undefined;
    list.sort((a, b) => {
      const x = value(a);
      const y = value(b);
      if (x === undefined) return 1;
      if (y === undefined) return -1;
      const order =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : collator.compare(String(x), String(y));
      return sort.direction === 'asc' ? order : -order;
    });
    return list;
  }, [keys.data, sort, collator]);

  const refresh = (): void =>
    void queryClient.invalidateQueries({ queryKey: keysKey });
  const refetchOptions = options.refetch;
  const outletContext = useMemo<ApiKeysOutletContext>(
    () => ({
      scopeOptions: options.data,
      scopeError: options.error,
      retryScope: () => void refetchOptions(),
      created: () => void queryClient.invalidateQueries({ queryKey: keysKey }),
    }),
    [options.data, options.error, refetchOptions, queryClient, keysKey],
  );

  const [confirmation, setConfirmation] = useState<{
    readonly open: boolean;
    readonly kind: 'rotate' | 'delete';
    readonly key: ApiKeyView | null;
  }>({ open: false, kind: 'delete', key: null });
  const [rotated, setRotated] = useState<CreatedApiKey>();
  const name = (key: ApiKeyView | null): string =>
    key?.name ?? key?.start ?? '';

  async function runConfirmation(): Promise<void> {
    const { kind, key } = confirmation;
    if (!key) return;
    if (kind === 'rotate') {
      const result = await api.request<{ data: CreatedApiKey }>({
        path: `apiKeys/${encodeURIComponent(key.id)}/rotate`,
        method: 'POST',
      });
      setRotated(result.data);
      toaster.show({
        type: 'success',
        title: text('keys.toasts.rotated', { name: name(key) }),
      });
    } else {
      await api.request({
        path: `apiKeys/${encodeURIComponent(key.id)}`,
        method: 'DELETE',
      });
      toaster.show({
        type: 'success',
        title: text('keys.toasts.deleted', { name: name(key) }),
      });
    }
    refresh();
  }

  const head = (column: SortColumn, title: string) => (
    <SortableHead
      title={title}
      direction={sort.column === column ? sort.direction : false}
      onClick={() =>
        setSort((current) => ({
          column,
          direction:
            current.column === column && current.direction === 'desc'
              ? 'asc'
              : 'desc',
        }))
      }
    />
  );
  const newLink = { pathname: 'new', search: location.search };

  let content: ReactElement;
  if ((keys.error && !keys.data) || (options.error && !options.data)) {
    content = (
      <LoadFailure
        error={keys.error ?? options.error}
        what={text('keys.what')}
        onRetry={() => {
          refresh();
          void options.refetch();
        }}
      />
    );
  } else if (!keys.data || !options.data) {
    content = <TableSkeleton columns={5} />;
  } else if (rows.length === 0) {
    content = (
      <Empty className='min-h-48 border border-dashed'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <KeyRoundIcon />
          </EmptyMedia>
          <EmptyTitle>{text('keys.emptyTitle')}</EmptyTitle>
          <EmptyDescription>
            {text(mayCreate ? 'keys.emptyBody' : 'keys.emptyNoCreate')}
          </EmptyDescription>
        </EmptyHeader>
        {mayCreate ? (
          <EmptyContent>
            <Button nativeButton={false} render={<Link to={newLink} />}>
              <PlusIcon data-icon='inline-start' />
              {text('keys.new')}
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    );
  } else {
    content = (
      <div className='overflow-x-auto rounded-lg border border-border bg-card shadow-xs'>
        <Table>
          <TableHeader>
            <TableRow>
              {head('name', text('keys.columns.name'))}
              <TableHead>{text('keys.columns.access')}</TableHead>
              {head('created', text('keys.columns.created'))}
              {head('expires', text('keys.columns.expires'))}
              {head('lastUsed', text('keys.columns.lastUsed'))}
              <TableHead>
                <span className='sr-only'>{text('common.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((key) => {
              const groups = key.scope
                ? Object.keys(key.scope.groups).length
                : 0;
              const expired =
                key.expiresAt !== null && Date.parse(key.expiresAt) <= now;
              return (
                <TableRow key={key.id}>
                  <TableCell className='max-w-64'>
                    <TruncatedText className='font-medium'>
                      {name(key)}
                    </TruncatedText>
                    {key.description ? (
                      <TruncatedText className='text-muted-foreground'>
                        {key.description}
                      </TruncatedText>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={key.scope ? 'info' : 'muted'}>
                      {key.scope
                        ? text('keys.limitedCount', { count: groups })
                        : text('keys.full')}
                    </Badge>
                  </TableCell>
                  <TableCell className='whitespace-nowrap text-muted-foreground'>
                    {formatDate(key.createdAt)}
                  </TableCell>
                  <TableCell className='whitespace-nowrap text-muted-foreground'>
                    <span className='inline-flex items-center gap-2'>
                      {key.expiresAt
                        ? formatDate(key.expiresAt)
                        : text('keys.neverExpires')}
                      {expired ? (
                        <Badge variant='warning'>{text('keys.expired')}</Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className='whitespace-nowrap text-muted-foreground'>
                    {key.lastUsedAt
                      ? formatDate(key.lastUsedAt)
                      : text('keys.neverUsed')}
                  </TableCell>
                  <TableCell className='w-0 text-right'>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant='ghost'
                            size='icon-sm'
                            aria-label={text('common.actionsFor', {
                              name: name(key),
                            })}
                          />
                        }
                      >
                        <MoreHorizontalIcon />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align='end'
                        className='w-auto min-w-40'
                      >
                        <DropdownMenuGroup>
                          {mayCreate ? (
                            <DropdownMenuItem
                              variant='destructive'
                              onClick={() =>
                                setConfirmation({
                                  open: true,
                                  kind: 'rotate',
                                  key,
                                })
                              }
                            >
                              <RotateCwIcon />
                              {text('keys.rotate')}
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuGroup>
                        {mayCreate ? <DropdownMenuSeparator /> : null}
                        <DropdownMenuGroup>
                          <DropdownMenuItem
                            variant='destructive'
                            onClick={() =>
                              setConfirmation({
                                open: true,
                                kind: 'delete',
                                key,
                              })
                            }
                          >
                            <Trash2Icon />
                            {text('keys.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }

  const refreshing = keys.isFetching;
  const target = name(confirmation.key);
  return (
    <PageContainer>
      <div ref={titleRef} tabIndex={-1} className='outline-none'>
        <PageHeader
          title={text('keys.title')}
          description={text('keys.description')}
          actions={
            <>
              {mayCreate && rows.length > 0 ? (
                <Button nativeButton={false} render={<Link to={newLink} />}>
                  <PlusIcon data-icon='inline-start' />
                  {text('keys.new')}
                </Button>
              ) : null}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant='outline'
                      size='icon'
                      aria-label={text('common.refresh')}
                      disabled={refreshing}
                      onClick={refresh}
                    />
                  }
                >
                  <RefreshCwIcon className={refreshing ? 'animate-spin' : ''} />
                </TooltipTrigger>
                <TooltipContent>{text('common.refresh')}</TooltipContent>
              </Tooltip>
            </>
          }
        />
      </div>
      {content}
      <ConfirmAction
        onGone={refresh}
        open={confirmation.open}
        onOpenChange={(open) =>
          setConfirmation((current) => ({ ...current, open }))
        }
        destructive
        title={text(
          confirmation.kind === 'rotate'
            ? 'keys.confirm.rotateTitle'
            : 'keys.confirm.deleteTitle',
          { name: target },
        )}
        description={text(
          confirmation.kind === 'rotate'
            ? 'keys.confirm.rotateBody'
            : 'keys.confirm.deleteBody',
        )}
        confirmLabel={text(
          confirmation.kind === 'rotate' ? 'keys.rotate' : 'keys.delete',
        )}
        onConfirm={runConfirmation}
        finalFocus={() =>
          confirmation.kind === 'delete' ? titleRef.current : null
        }
      />
      <Dialog
        open={rotated !== undefined}
        onOpenChange={(open) => !open && setRotated(undefined)}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>
              {text('keys.rotatedTitle', {
                name: rotated ? name(rotated.key) : '',
              })}
            </DialogTitle>
            <DialogDescription>{text('keys.secretWarning')}</DialogDescription>
          </DialogHeader>
          {rotated ? (
            <CopyField
              id='api-key-rotated-secret'
              value={rotated.secret}
              label={text('keys.secretLabel')}
            />
          ) : null}
          <DialogFooter>
            <Button onClick={() => setRotated(undefined)}>
              {text('common.done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Outlet context={outletContext} />
    </PageContainer>
  );
}
