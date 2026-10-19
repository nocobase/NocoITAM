import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { LifecycleDiagram } from '#components/lifecycle-diagram';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { apiErrorBody } from '@/lib/itam/api';
import { errorMessage, formatDate } from '@/lib/itam/format';
import {
  newRequestId,
  useDisposalApproverRange,
  useLifecycleDescription,
  useSaveDisposalApproverRange,
  type ApproverRange,
} from '@/lib/itam/lifecycle';
import { DISPOSALS_PATH } from '@/lib/itam/operations';
import { useReferenceNames } from '@/lib/itam/references';
import { roleTitle } from '@/lib/itam/user-roles';

/**
 * 设置 → 报废流程 (2026-10-18, docs/adr/0001-record-lifecycles.md): the
 * disposal's lifecycle as declared in source, which nobody edits here, and
 * the one thing an administrator sets on it — whom a submitter may ask to
 * approve. The range narrows the people who hold disposal approval and
 * never widens them; it applies to the next submission, and a request
 * already waiting keeps the approver it asked.
 */
export default function DisposalFlowSettingsPage(): ReactElement {
  const { t } = useTranslation();
  const description = useLifecycleDescription(DISPOSALS_PATH);
  const range = useDisposalApproverRange(DISPOSALS_PATH);
  return (
    <PageContainer>
      <PageHeader
        title={t('settings.disposalFlow.title')}
        description={t('settings.disposalFlow.description')}
      />
      <div className='max-w-4xl space-y-6'>
        {range.data ? (
          <ApproverRangeCard range={range.data} />
        ) : (
          <Skeleton className='h-48 w-full rounded-lg' />
        )}
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.disposalFlow.diagram')}</CardTitle>
            <p className='text-sm text-muted-foreground'>
              {t('settings.disposalFlow.diagramHint')}
            </p>
          </CardHeader>
          <CardContent>
            {description.data ? (
              <LifecycleDiagram
                ariaLabel={t('lifecycle.diagram')}
                description={description.data}
                stateLabel={(state) => t(`enums.disposalStatus.${state.name}`)}
                transitionLabel={(transition) =>
                  t(`disposals.transitions.${transition.name}`)
                }
                endLabel={t('lifecycle.end')}
                direction='DOWN'
                autoHeight
              />
            ) : (
              <Skeleton className='h-96 w-full rounded-lg' />
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

/**
 * 谁可以审批, laid out as NocoCRM's approver card (2026-10-19): the save in
 * the header, live only once something changed; the roles and the people,
 * any one of them enough; whom that offers now; and whose version it is.
 * Choosing nothing is everyone who may approve disposals.
 */
function ApproverRangeCard({
  range,
}: {
  readonly range: ApproverRange;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const save = useSaveDisposalApproverRange(DISPOSALS_PATH);
  const [roles, setRoles] = useState<ReadonlySet<string>>(
    () => new Set(range.roles),
  );
  const [users, setUsers] = useState<ReadonlySet<string>>(
    () => new Set(range.users),
  );
  // One key per save of these values, kept for its retries.
  const [requestId, setRequestId] = useState(newRequestId);
  const changed = () => setRequestId(newRequestId());
  const choose =
    (set: (next: ReadonlySet<string>) => void) => (next: readonly string[]) => {
      set(new Set(next));
      changed();
    };
  const same = (chosen: ReadonlySet<string>, saved: readonly string[]) =>
    chosen.size === saved.length && saved.every((key) => chosen.has(key));
  const dirty = !same(roles, range.roles) || !same(users, range.users);
  const conflict = apiErrorBody(save.error)?.rule === 'CONFLICT';
  const names = useReferenceNames([
    { collection: 'users', ids: range.updatedById ? [range.updatedById] : [] },
  ]);
  const separator = i18n.language.startsWith('zh') ? '、' : ', ';
  const byDefault = !range.updatedById || range.updatedById === 'system';
  return (
    <Card>
      <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-3'>
        <div className='grid gap-1'>
          <CardTitle>{t('settings.disposalFlow.approvers')}</CardTitle>
          <p className='text-sm text-muted-foreground'>
            {t('settings.disposalFlow.approversHint')}
          </p>
        </div>
        <Button
          disabled={!dirty || save.isPending}
          // Against the version shown now: after a conflict the page has
          // loaded the newer one and keeps what was being written, so saving
          // again is a deliberate choice to replace it. A failed save takes
          // a new key, since the same key with other input is refused.
          onClick={() =>
            save.mutate(
              {
                anyone: roles.size === 0 && users.size === 0,
                roles: [...roles],
                users: [...users],
                revision: range.revision,
                requestId,
              },
              { onError: changed },
            )
          }
        >
          {t('actions.save')}
        </Button>
      </CardHeader>
      <CardContent className='space-y-4'>
        {save.error && !conflict ? (
          <p role='alert' className='text-sm text-destructive'>
            {apiErrorBody(save.error)?.message ?? errorMessage(save.error)}
          </p>
        ) : null}
        <div className='grid gap-4 sm:grid-cols-2'>
          <ChoiceSelect
            id='approver-range-roles'
            title={t('settings.disposalFlow.byRole')}
            options={range.roleOptions.map((role) => ({
              key: role.key,
              label: roleTitle(role, t),
            }))}
            chosen={roles}
            onChange={choose(setRoles)}
          />
          <ChoiceSelect
            id='approver-range-users'
            title={t('settings.disposalFlow.byPerson')}
            options={range.userOptions.map((person) => ({
              key: person.id,
              label: person.name,
            }))}
            chosen={users}
            onChange={choose(setUsers)}
          />
        </div>
        {/* The saved range can be left with nobody when the permission sets
            change afterwards; saving refuses that, the sets cannot. */}
        {conflict ? (
          <p className='text-sm text-muted-foreground'>
            {t('settings.disposalFlow.conflict')}
          </p>
        ) : range.approvers.length === 0 ? (
          <p role='alert' className='text-sm text-destructive'>
            {t('settings.disposalFlow.nobodyLeft')}
          </p>
        ) : (
          <p className='text-sm'>
            {t('settings.disposalFlow.current', {
              names: range.approvers
                .map((person) => person.name)
                .join(separator),
            })}
          </p>
        )}
        <p className='text-xs text-muted-foreground'>
          {byDefault
            ? t('settings.disposalFlow.byDefault')
            : t('settings.disposalFlow.version', {
                revision: range.revision,
                name:
                  names.users?.get(range.updatedById ?? '') ??
                  range.updatedById,
                time: formatDate(range.updatedAt, true),
              })}
        </p>
      </CardContent>
    </Card>
  );
}

/** Several of a short list, picked in a dropdown (2026-10-19). */
function ChoiceSelect({
  id,
  title,
  options,
  chosen,
  onChange,
}: {
  readonly id: string;
  readonly title: string;
  readonly options: readonly { readonly key: string; readonly label: string }[];
  readonly chosen: ReadonlySet<string>;
  readonly onChange: (next: readonly string[]) => void;
}): ReactElement {
  const { t } = useTranslation();
  const labelOf = (key: string) =>
    options.find((option) => option.key === key)?.label ?? key;
  return (
    <div className='grid content-start gap-1.5'>
      <Label htmlFor={id}>{title}</Label>
      <Select
        multiple
        value={[...chosen]}
        onValueChange={(next) => onChange(next)}
      >
        <SelectTrigger id={id} className='w-full'>
          <SelectValue>
            {(value: string[]) =>
              value.length > 0 ? (
                <span className='truncate'>
                  {value.map(labelOf).join('、')}
                </span>
              ) : (
                <span className='text-muted-foreground'>
                  {t('settings.disposalFlow.choose')}
                </span>
              )
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.key} value={option.key}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
