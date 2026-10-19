import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { LifecycleDiagram } from '#components/lifecycle-diagram';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
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
import {
  newRequestId,
  useDisposalApproverRange,
  useLifecycleDescription,
  useSaveDisposalApproverRange,
  type ApproverRange,
} from '@/lib/itam/lifecycle';
import { DISPOSALS_PATH } from '@/lib/itam/operations';
import { roleTitle } from '@/lib/itam/user-roles';

import { SettingsCard } from './settings-parts';

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

function ApproverRangeCard({
  range,
}: {
  readonly range: ApproverRange;
}): ReactElement {
  const { t } = useTranslation();
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
  const conflict = apiErrorBody(save.error)?.rule === 'CONFLICT';
  return (
    <SettingsCard
      title={t('settings.disposalFlow.approvers')}
      description={t('settings.disposalFlow.approversHint')}
      // Against the version shown now: after a conflict the page has
      // loaded the newer one and keeps what was being written, so saving
      // again is a deliberate choice to replace it. A failed save takes a
      // new key, since the same key with other input is refused.
      // Nothing ticked is everyone who may approve (2026-10-18: a separate
      // choice for it was one step more saying the same thing).
      onSave={() =>
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
      saving={save.isPending}
      error={conflict ? null : save.error}
      saved={save.isSuccess}
    >
      <div className='grid gap-6 sm:grid-cols-2'>
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
      {!conflict && range.approvers.length === 0 ? (
        <p role='alert' className='text-sm text-destructive'>
          {t('settings.disposalFlow.nobodyLeft')}
        </p>
      ) : (
        <p className='text-sm text-muted-foreground'>
          {conflict
            ? t('settings.disposalFlow.conflict')
            : t('settings.disposalFlow.current', {
                names: range.approvers.map((person) => person.name).join('、'),
              })}
        </p>
      )}
    </SettingsCard>
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
                  {t('settings.disposalFlow.noneChosen')}
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
