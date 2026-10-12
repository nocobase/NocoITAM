// A permission set's Members tab: who holds it, people and "all signed-in
// users", added through the Add members dialog and removed after a
// confirmation. The authorization plugin keeps the last administrator
// (LAST_ASSIGNMENT).
import { useToaster } from '@nocobase/app-client';
import {
  useAuthorizationClient,
  type PermissionSetAssignment,
} from '@nocobase/app-plugin-authorization/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  MoreHorizontalIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersRoundIcon,
} from 'lucide-react';
import { useMemo, useRef, useState, type ReactElement } from 'react';
import { Link, Outlet, useLocation, useOutletContext } from 'react-router';

import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  ConfirmAction,
  LoadFailure,
  TableSkeleton,
  TruncatedText,
} from '../../shared.js';
import { useAdminText, useLocalized } from '../../hooks.js';
import {
  canRevoke,
  setFailure,
  useMembers,
  useMembersKey,
  useSetActions,
  useSetTitle,
  type MembersOutletContext,
  type PermissionSetPageContext,
} from '../data.js';

const AUTHENTICATED = 'authenticated';

export default function MembersTab(): ReactElement {
  const context = useOutletContext<PermissionSetPageContext>();
  const { set } = context;
  const { text } = useAdminText();
  const localized = useLocalized();
  const title = useSetTitle();
  const authz = useAuthorizationClient();
  const toaster = useToaster();
  const queryClient = useQueryClient();
  const location = useLocation();
  const can = useSetActions();
  const headingRef = useRef<HTMLParagraphElement>(null);
  const membersKey = useMembersKey(set.key);

  const members = useMembers(set.key);
  const reloadMembers = (): void =>
    void queryClient.invalidateQueries({ queryKey: membersKey });
  const outletContext = useMemo<MembersOutletContext>(
    () => ({
      ...context,
      members: members.data?.assignments ?? [],
      reloadMembers: () =>
        void queryClient.invalidateQueries({ queryKey: membersKey }),
    }),
    [context, members.data, queryClient, membersKey],
  );

  const mayAssign = can('assign', set);
  const mayRemove = mayAssign && canRevoke(set);
  const nameOf = (assignment: PermissionSetAssignment): string => {
    if (assignment.subject.type === AUTHENTICATED)
      return text('sets.members.everyone');
    const user = members.data?.users.find(
      (item) => item.id === assignment.subject.id,
    );
    return user
      ? localized(user.title, assignment.subject.id)
      : text('sets.members.unknown', { id: assignment.subject.id });
  };
  const [removal, setRemoval] = useState<{
    readonly open: boolean;
    readonly assignment: PermissionSetAssignment | null;
  }>({ open: false, assignment: null });
  const addLink = { pathname: 'add', search: location.search };

  let body: ReactElement;
  const rows = members.data?.assignments;
  if (members.error && !rows) {
    body = (
      <LoadFailure
        error={members.error}
        what={text('sets.members.what')}
        onRetry={reloadMembers}
      />
    );
  } else if (!rows) {
    body = <TableSkeleton columns={2} rows={3} />;
  } else if (rows.length === 0) {
    body = (
      <Empty className='min-h-48 border border-dashed'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <UsersRoundIcon />
          </EmptyMedia>
          <EmptyTitle>{text('sets.members.emptyTitle')}</EmptyTitle>
          <EmptyDescription>
            {text(
              mayAssign
                ? 'sets.members.emptyBody'
                : 'sets.members.emptyReadOnly',
            )}
          </EmptyDescription>
        </EmptyHeader>
        {mayAssign ? (
          <EmptyContent>
            <Button nativeButton={false} render={<Link to={addLink} />}>
              <UserPlusIcon data-icon='inline-start' />
              {text('sets.members.add')}
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    );
  } else {
    body = (
      <div className='overflow-x-auto rounded-lg border border-border bg-card shadow-xs'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{text('sets.members.name')}</TableHead>
              <TableHead>{text('sets.members.type')}</TableHead>
              <TableHead>
                <span className='sr-only'>{text('common.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((assignment) => {
              const name = nameOf(assignment);
              return (
                <TableRow key={assignment.id}>
                  <TableCell className='max-w-72'>
                    <TruncatedText className='font-medium'>
                      {name}
                    </TruncatedText>
                  </TableCell>
                  <TableCell className='text-muted-foreground'>
                    {text(
                      assignment.subject.type === AUTHENTICATED
                        ? 'sets.members.everyone'
                        : 'sets.members.user',
                    )}
                  </TableCell>
                  <TableCell className='w-0 text-right'>
                    {mayRemove ? (
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
                          <DropdownMenuItem
                            variant='destructive'
                            onClick={() =>
                              setRemoval({ open: true, assignment })
                            }
                          >
                            <Trash2Icon />
                            {text('sets.members.remove')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }

  const target = removal.assignment ? nameOf(removal.assignment) : '';
  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p
          ref={headingRef}
          tabIndex={-1}
          className='text-sm text-muted-foreground outline-none'
        >
          {text('sets.members.heading')}
        </p>
        {mayAssign && rows && rows.length > 0 ? (
          <Button
            variant='outline'
            nativeButton={false}
            render={<Link to={addLink} />}
          >
            <UserPlusIcon data-icon='inline-start' />
            {text('sets.members.add')}
          </Button>
        ) : null}
      </div>
      {body}
      <ConfirmAction
        onGone={reloadMembers}
        open={removal.open}
        onOpenChange={(open) => setRemoval((current) => ({ ...current, open }))}
        destructive
        title={text('sets.members.removeTitle', {
          name: target,
          set: title(set),
        })}
        description={text('sets.members.removeBody')}
        confirmLabel={text('sets.members.remove')}
        onConfirm={async () => {
          if (!removal.assignment) return;
          await authz.revoke(set.key, removal.assignment.id);
          authz.invalidate();
          toaster.show({
            type: 'success',
            title: text('sets.members.removed', { name: target }),
          });
          reloadMembers();
        }}
        failure={(error) => setFailure(error, text)}
        finalFocus={() => headingRef.current}
      />
      {/* Add members, and the header's Rename, render here, over this tab. */}
      <Outlet context={outletContext} />
    </div>
  );
}
