// The Users page's card of invitations not yet accepted (pending or
// expired; the plugin keeps no others). Resend sends the email again, or
// gives a new link to copy when no email can go out; Revoke ends one.
import { useToaster } from '@nocobase/app-client';
import type {
  UserInvitation,
  UserInvitationResult,
} from '@nocobase/app-plugin-users/client/user-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MailIcon, MoreHorizontalIcon, Trash2Icon } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { ToneBadge as Badge } from '@/components/settings/tone-badge';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
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
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';

import { ConfirmAction, LoadFailure } from '../shared.js';
import { useAdminText, useDateTime, useFailureText } from '../hooks.js';
import { useUsersClient, useUsersKey } from './data.js';
import { InviteResults } from './invite.js';

export function Invitations(): ReactElement | null {
  const { text } = useAdminText();
  const client = useUsersClient();
  const queryClient = useQueryClient();
  const usersKey = useUsersKey();
  const toaster = useToaster();
  const failureText = useFailureText();
  const formatDate = useDateTime();
  const query = useQuery({
    queryKey: [...usersKey, 'invitations'],
    queryFn: () => client.listInvitations(),
    retry: false,
  });
  const [resending, setResending] = useState<string>();
  const [resent, setResent] = useState<UserInvitationResult>();
  const [revoking, setRevoking] = useState<{
    readonly open: boolean;
    readonly invitation: UserInvitation | null;
  }>({ open: false, invitation: null });

  const refresh = (): void =>
    void queryClient.invalidateQueries({
      queryKey: [...usersKey, 'invitations'],
    });

  function resend(invitation: UserInvitation): void {
    setResending(invitation.id);
    client
      .resendInvitation(invitation.id)
      .then(
        (result) => {
          if (result.outcome === 'invited' && !result.emailSent)
            setResent(result);
          else
            toaster.show({
              type: 'success',
              title: text('invitations.resent', { email: invitation.email }),
            });
        },
        (error: unknown) =>
          toaster.show({ type: 'error', title: failureText(error) }),
      )
      .finally(() => {
        setResending(undefined);
        refresh();
      });
  }

  let body: ReactElement;
  if (query.error && !query.data) {
    body = (
      <LoadFailure
        error={query.error}
        what={text('invitations.what')}
        onRetry={() => void query.refetch()}
      />
    );
  } else if (!query.data) {
    body = (
      <div
        role='status'
        aria-label={text('common.loading')}
        className='flex flex-col gap-2'
      >
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
      </div>
    );
  } else {
    body = (
      <ul className='divide-y'>
        {query.data.map((invitation) => (
          <li
            key={invitation.id}
            className='flex items-center gap-3 py-2.5 text-sm'
          >
            <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
              <span className='flex flex-wrap items-center gap-2'>
                <span className='font-medium break-all'>
                  {invitation.email}
                </span>
                <Badge
                  variant={invitation.status === 'expired' ? 'warning' : 'info'}
                >
                  {text(
                    invitation.status === 'expired'
                      ? 'invitations.expired'
                      : 'invitations.pending',
                  )}
                </Badge>
              </span>
              <span className='text-muted-foreground'>
                {text('invitations.invitedBy', {
                  name: invitation.invitedBy.name,
                  date: formatDate(invitation.expiresAt),
                })}
                {invitation.summary.length > 0
                  ? ` · ${invitation.summary.join(', ')}`
                  : ''}
              </span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={text('common.actionsFor', {
                      name: invitation.email,
                    })}
                    disabled={resending === invitation.id}
                  />
                }
              >
                {resending === invitation.id ? (
                  <Spinner />
                ) : (
                  <MoreHorizontalIcon />
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-auto min-w-40'>
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => resend(invitation)}>
                    <MailIcon />
                    {text('invitations.resend')}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant='destructive'
                    onClick={() => setRevoking({ open: true, invitation })}
                  >
                    <Trash2Icon />
                    {text('invitations.revoke')}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
      </ul>
    );
  }

  // Nothing pending: no card at all.
  if (query.data && query.data.length === 0) return null;
  const email = revoking.invitation?.email ?? '';
  return (
    <Card>
      <CardHeader>
        <CardTitle>{text('invitations.title')}</CardTitle>
        <CardDescription>{text('invitations.description')}</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
      <ConfirmAction
        onGone={refresh}
        open={revoking.open}
        onOpenChange={(open) =>
          setRevoking((current) => ({ ...current, open }))
        }
        destructive
        title={text('invitations.revokeTitle', { email })}
        description={text('invitations.revokeBody')}
        confirmLabel={text('invitations.revoke')}
        onConfirm={async () => {
          if (!revoking.invitation) return;
          await client.revokeInvitation(revoking.invitation.id);
          toaster.show({
            type: 'success',
            title: text('invitations.revoked', { email }),
          });
          refresh();
        }}
      />
      <Dialog
        open={resent !== undefined}
        onOpenChange={(open) => !open && setResent(undefined)}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>{text('invitations.resultsTitle')}</DialogTitle>
            <DialogDescription>
              {text('invitations.resentLink')}
            </DialogDescription>
          </DialogHeader>
          {resent ? <InviteResults results={[resent]} /> : null}
          <DialogFooter>
            <Button variant='outline' onClick={() => setResent(undefined)}>
              {text('common.done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
