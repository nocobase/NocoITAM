// Add members (…/:setKey/members/add): users found by a search, ten at a
// time as the list scrolls, and "all signed-in users" where the set may be
// given to them. Each pick is one assignment.
import { useAuthorizationClient } from '@nocobase/app-plugin-authorization/client';
import { useToaster } from '@nocobase/app-client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SearchIcon } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { useOutletContext } from 'react-router';

import { Checkbox } from '#components/ui/checkbox';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '#components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#components/ui/input-group';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';

import { AutoLoadMore } from '../../../../components/settings/auto-load.js';
import { FormDialog, LoadFailure } from '../../shared.js';
import { useAdminText, useLocalized } from '../../hooks.js';
import {
  setFailure,
  useOptions,
  usePermissionSetsKey,
  type MembersOutletContext,
} from '../data.js';

const FORM_ID = 'settings-permission-set-add-members';
const PAGE = 10;
const AUTHENTICATED = 'authenticated';

export default function AddMembersDialog(): ReactElement {
  const { text } = useAdminText();
  const localized = useLocalized();
  const authz = useAuthorizationClient();
  const toaster = useToaster();
  const { set, members, reloadMembers } =
    useOutletContext<MembersOutletContext>();
  const options = useOptions();
  const setsKey = usePermissionSetsKey();

  // The search box keeps its own text; the query follows it 300 ms later, never mid-composition (A7).
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [composing, setComposing] = useState(false);
  useEffect(() => {
    if (composing) return;
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search, composing]);

  const users = useInfiniteQuery({
    queryKey: [...setsKey, 'subjects', query],
    queryFn: ({ pageParam }) =>
      authz.listSubjects('permissionSets', 'user', {
        search: query || undefined,
        page: pageParam,
        pageSize: PAGE,
      }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) =>
      pages.length * PAGE < last.total ? pages.length + 1 : undefined,
    retry: false,
  });
  const found = users.data?.pages.flatMap((page) => page.items) ?? [];

  const held = new Set(
    members.map((member) => `${member.subject.type}:${member.subject.id}`),
  );
  const assignable = (type: string): boolean =>
    set.protection?.assignableTo === undefined ||
    set.protection.assignableTo.includes(type);
  const everyone = options.data?.subjectTypes.find(
    (item) => item.type === AUTHENTICATED,
  );
  const everyoneId =
    everyone?.selection.type === 'fixed' ? everyone.selection.id : undefined;
  const offerEveryone =
    everyoneId !== undefined &&
    assignable(AUTHENTICATED) &&
    !held.has(`${AUTHENTICATED}:${everyoneId}`);

  const [picked, setPicked] = useState<readonly string[]>([]);
  const [pickEveryone, setPickEveryone] = useState(false);
  const [error, setError] = useState<string>();
  const [rootError, setRootError] = useState<string>();

  async function submit(): Promise<boolean> {
    const subjects = [
      ...picked.map((id) => ({ type: 'user', id })),
      ...(pickEveryone && everyoneId
        ? [{ type: AUTHENTICATED, id: everyoneId }]
        : []),
    ];
    if (subjects.length === 0) {
      setError(text('sets.members.chooseOne'));
      document.getElementById(`${FORM_ID}-search`)?.focus();
      return false;
    }
    setError(undefined);
    setRootError(undefined);
    try {
      await Promise.all(
        subjects.map((subject) => authz.assign(set.key, { subject })),
      );
      authz.invalidate();
      toaster.show({
        type: 'success',
        title:
          subjects.length === 1
            ? text('sets.members.addedOne')
            : text('sets.members.added', { count: subjects.length }),
      });
      reloadMembers();
      return true;
    } catch (caught: unknown) {
      reloadMembers();
      setRootError(setFailure(caught, text));
      return false;
    }
  }

  let list: ReactElement;
  if (users.error && !users.data) {
    list = (
      <LoadFailure
        error={users.error}
        what={text('sets.members.what')}
        onRetry={() => void users.refetch()}
      />
    );
  } else if (!users.data) {
    list = (
      <div
        role='status'
        aria-label={text('common.loading')}
        className='flex flex-col gap-2'
      >
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className='h-8 w-full' />
        ))}
      </div>
    );
  } else if (found.length === 0) {
    list = (
      <p className='py-6 text-center text-sm text-muted-foreground'>
        {text('sets.members.noUsers')}
      </p>
    );
  } else {
    list = (
      <div className='flex flex-col'>
        {found.map((user) => {
          const already = held.has(`user:${user.id}`);
          const checked = already || picked.includes(user.id);
          const id = `${FORM_ID}-user-${user.id}`;
          return (
            <Field key={user.id} orientation='horizontal' className='py-1.5'>
              <Checkbox
                id={id}
                checked={checked}
                disabled={already || !assignable('user')}
                onCheckedChange={(on) =>
                  setPicked((current) =>
                    on
                      ? [...current, user.id]
                      : current.filter((item) => item !== user.id),
                  )
                }
              />
              <FieldLabel
                htmlFor={id}
                className='min-w-0 flex-col items-start gap-0 font-normal'
              >
                <span className='truncate'>
                  {localized(user.title, user.id)}
                </span>
                {already ? (
                  <span className='text-xs text-muted-foreground'>
                    {text('sets.members.already')}
                  </span>
                ) : user.description ? (
                  <span className='truncate text-xs text-muted-foreground'>
                    {localized(user.description)}
                  </span>
                ) : null}
              </FieldLabel>
            </Field>
          );
        })}
        <AutoLoadMore
          hasMore={users.hasNextPage}
          loading={users.isFetchingNextPage}
          onLoad={() => void users.fetchNextPage()}
        />
      </div>
    );
  }

  return (
    <FormDialog
      title={text('sets.members.addTitle')}
      formId={FORM_ID}
      submitLabel={text('sets.members.addSubmit')}
      submit={submit}
      rootError={rootError}
    >
      {offerEveryone ? (
        <Field orientation='horizontal'>
          <Checkbox
            id={`${FORM_ID}-everyone`}
            checked={pickEveryone}
            onCheckedChange={(on) => setPickEveryone(on)}
          />
          <FieldLabel
            htmlFor={`${FORM_ID}-everyone`}
            className='flex-col items-start gap-0 font-normal'
          >
            {text('sets.members.everyone')}
            <FieldDescription>
              {text('sets.members.everyoneHint')}
            </FieldDescription>
          </FieldLabel>
        </Field>
      ) : null}
      <Field data-invalid={error ? true : undefined}>
        <InputGroup>
          <InputGroupAddon>
            {users.isFetching && !users.isFetchingNextPage ? (
              <Spinner />
            ) : (
              <SearchIcon />
            )}
          </InputGroupAddon>
          <InputGroupInput
            id={`${FORM_ID}-search`}
            // Enter searches as typing does; it does not add the picked members.
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault();
            }}
            value={search}
            placeholder={text('sets.members.search')}
            aria-label={text('sets.members.search')}
            onChange={(event) => setSearch(event.target.value)}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={(event) => {
              setComposing(false);
              setSearch(event.currentTarget.value);
            }}
          />
        </InputGroup>
        <FieldError>{error}</FieldError>
      </Field>
      <div className='max-h-80 overflow-y-auto'>{list}</div>
    </FormDialog>
  );
}
