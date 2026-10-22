import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useApi, type ListResponse } from '@/lib/itam/api';

interface Account {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
  readonly disabled: boolean;
}

/**
 * A user shown as the sign-in it is: the name, the username beside it, and
 * whether the account is enabled — for a person's 关联登录用户, where two
 * people of a name are told apart by username and a disabled account is
 * worth seeing at a glance (a leaver's sign-in is not disabled by the
 * register). `/itam/users` answers a lookup by id for anybody.
 */
export function UserAccount({
  id,
  tagOnly = false,
}: {
  readonly id: string;
  /**
   * The 启用 / 已停用 tag alone, the account named on hover (2026-10-22): a
   * list row names the person already.
   */
  readonly tagOnly?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const account = useQuery({
    queryKey: ['itam', 'itam/users', 'account', id],
    queryFn: async () =>
      (
        await api.request<ListResponse<Account>>({
          path: 'itam/users',
          query: { ids: id },
        })
      ).data[0],
    staleTime: 60_000,
  });
  const row = account.data;
  if (!row) return <span>{account.isLoading ? '…' : id}</span>;
  const tag = (
    <Badge
      variant='secondary'
      className={
        row.disabled
          ? 'bg-muted text-muted-foreground'
          : 'bg-success text-success-foreground'
      }
    >
      {t(row.disabled ? 'users.disabled' : 'users.enabled')}
    </Badge>
  );
  if (tagOnly)
    return (
      <Tooltip>
        <TooltipTrigger render={<span className='inline-flex' />}>
          {tag}
        </TooltipTrigger>
        <TooltipContent>
          {[row.name, row.username].filter(Boolean).join(' · ')}
        </TooltipContent>
      </Tooltip>
    );
  return (
    <span className='inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1'>
      <span className='truncate'>{row.name}</span>
      {row.username ? (
        <span className='font-mono text-xs text-muted-foreground'>
          {row.username}
        </span>
      ) : null}
      {tag}
    </span>
  );
}
