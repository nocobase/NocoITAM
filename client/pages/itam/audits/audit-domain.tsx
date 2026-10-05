import { useTranslation } from '@nocobase/i18n/client';
import { createStatusBoard } from '@/components/itam/status-board';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlus2, Flag, Play, X } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useParams } from 'react-router';

import { AttachmentsTab } from '@/components/itam/attachments-tab';
import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { FieldInput } from '@/components/itam/field-input';
import { MultiReferenceInput } from '@/components/itam/multi-reference';
import { RECORD_SUMMARIES } from '@/components/itam/record-summaries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  apiErrorBody,
  useApi,
  useItamMutations,
  type ItamRecord,
} from '@/lib/itam/api';
import type { DomainConfig } from '@/lib/itam/domain';
import { errorMessage, formatDate, text } from '@/lib/itam/format';
import {
  AUDITS_PATH,
  AUDIT_STATUS_DOT,
  AUDIT_TASK_FIELDS,
  type AuditScope,
} from '@/lib/itam/operations';
import { useCollectionPermissions } from '@/lib/itam/permissions';
import { useReferenceNames } from '@/lib/itam/references';
import { useConfirm } from '@/lib/itam/use-confirm';

// eslint-disable-next-line react-refresh/only-export-components -- a domain config is data that references its components
export const auditDomain: DomainConfig = {
  name: 'auditTasks',
  path: AUDITS_PATH,
  route: 'audits',
  i18n: 'audits',
  fields: AUDIT_TASK_FIELDS,
  fieldDisplay: (field, record) =>
    field.key === 'executorIds' ? (
      <ExecutorNames ids={record.executorIds} />
    ) : field.key === 'scope' ? (
      <AuditScopeValue scope={record.scope} />
    ) : undefined,
  // The generic input has nothing for a scope or a list of people, so the
  // two get the create dialog's own editors.
  fieldEditor: (field) =>
    field.key === 'scope'
      ? (value, onChange) => (
          <ScopeInputs
            value={scopeOf(value)}
            onChange={(next) => onChange(scopeValue(next))}
          />
        )
      : field.key === 'executorIds'
        ? (value, onChange) => (
            <MultiReferenceInput
              reference={{ collection: 'users' }}
              value={Array.isArray(value) ? value.map((id) => text(id)) : []}
              onChange={onChange}
            />
          )
        : undefined,
  editable: (record) =>
    !['completed', 'cancelled'].includes(text(record.status)),
  // Opens on a board by status; the list is one click away.
  Board: createStatusBoard({
    path: AUDITS_PATH,
    route: 'audits',
    fields: AUDIT_TASK_FIELDS,
    nameField: 'name',
    dots: AUDIT_STATUS_DOT,
    statuses: [
      'notStarted',
      'inProgress',
      'pendingDifferences',
      'completed',
      'cancelled',
    ],
    card: {
      // Counted out of expected: how far the count has got.
      meta: (record) =>
        record.status === 'notStarted'
          ? null
          : `${Number(record.countedCount ?? 0)} / ${Number(record.expectedCount ?? 0)}`,
      lines: [
        (record, t) =>
          t('board.period', {
            from: formatDate(record.plannedStart),
            to: formatDate(record.plannedEnd),
          }),
        (record, t) =>
          Number(record.differenceCount ?? 0) > 0
            ? t('board.differences', {
                count: Number(record.differenceCount),
              })
            : null,
      ],
      footer: [
        (record, t) =>
          t('board.expected', { count: Number(record.expectedCount ?? 0) }),
      ],
    },
    defaultSort: 'plannedStart',
  }),
  nameField: 'name',
  defaultSort: 'plannedStart',
  deletable: (record) => record.status === 'notStarted',
  deleteInMenu: true,
  tabs: [
    { key: 'items', label: 'tabs.auditItems' },
    { key: 'attachments', label: 'tabs.attachments' },
  ],
  summaryTimestamps: false,
  defaultTab: 'items',
  Create: AuditCreateDialog,
  Actions: AuditActions,
  summary: RECORD_SUMMARIES.auditTasks.items,
};

function ExecutorNames({ ids }: { readonly ids: unknown }): ReactElement {
  const { t } = useTranslation();
  const list = Array.isArray(ids) ? ids.map((id) => text(id)) : [];
  const names = useReferenceNames([{ collection: 'users', ids: list }]);
  return (
    <span>
      {list
        .map(
          (id) =>
            names.users?.get(id) ??
            (names.users ? t('common.missingRecord') : '…'),
        )
        .join(', ') || '—'}
    </span>
  );
}

function AuditScopeValue({ scope }: { readonly scope: unknown }): ReactElement {
  const { t } = useTranslation();
  const value =
    scope && typeof scope === 'object'
      ? (scope as Record<string, unknown>)
      : {};
  const dimensions = [
    {
      key: 'locationIds',
      collection: 'locations',
      label: 'references.locations',
    },
    {
      key: 'departmentIds',
      collection: 'departments',
      label: 'references.departments',
    },
    {
      key: 'categoryIds',
      collection: 'categories',
      label: 'references.categories',
    },
    { key: 'deviceIds', collection: 'devices', label: 'references.devices' },
  ].map((dimension) => ({
    ...dimension,
    ids: Array.isArray(value[dimension.key])
      ? (value[dimension.key] as unknown[]).map(text)
      : [],
  }));
  const names = useReferenceNames(dimensions);
  return (
    <div className='space-y-1'>
      {dimensions.some((dimension) => dimension.ids.length)
        ? dimensions
            .filter((dimension) => dimension.ids.length)
            .map((dimension) => (
              <div key={dimension.key} className='break-words'>
                <span className='text-muted-foreground'>
                  {t(dimension.label)}：
                </span>
                {dimension.ids
                  .map(
                    (id) =>
                      names[dimension.collection]?.get(id) ??
                      t('common.notFound'),
                  )
                  .join('、')}
              </div>
            ))
        : '—'}
    </div>
  );
}

const SCOPE_KEYS = [
  'locationIds',
  'departmentIds',
  'categoryIds',
  'deviceIds',
] as const;

/** A stored scope with every dimension present, for the editors. */
function scopeOf(value: unknown): Required<AuditScope> {
  const scope =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    SCOPE_KEYS.map((key) => [
      key,
      Array.isArray(scope[key])
        ? (scope[key] as unknown[]).map((id) => text(id))
        : [],
    ]),
  ) as unknown as Required<AuditScope>;
}

/** The scope as it is stored: only the dimensions that narrow it. */
function scopeValue(scope: Required<AuditScope>): AuditScope {
  return Object.fromEntries(
    Object.entries(scope).filter(([, ids]) => ids.length > 0),
  );
}

function scopeNarrowed(scope: Required<AuditScope>): boolean {
  return SCOPE_KEYS.some((key) => scope[key].length > 0);
}

/**
 * The four scope pickers and how many devices they match, shared by the
 * create dialog and the task's own page while it has not started.
 */
function ScopeInputs({
  value,
  onChange,
  enabled = true,
}: {
  readonly value: Required<AuditScope>;
  readonly onChange: (next: Required<AuditScope>) => void;
  readonly enabled?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const narrowed = scopeNarrowed(value);
  const preview = useQuery({
    queryKey: ['itam', AUDITS_PATH, 'preview-scope', value],
    queryFn: async () =>
      (
        await api.request<{ data: { expected: number } }>({
          path: `${AUDITS_PATH}/preview-scope`,
          method: 'POST',
          json: value,
        })
      ).data.expected,
    enabled: enabled && narrowed,
  });
  const scopeFields: readonly {
    key: keyof AuditScope;
    label: string;
    collection: string;
    filter?: Record<string, string>;
  }[] = [
    { key: 'locationIds', label: 'fields.locations', collection: 'locations' },
    {
      key: 'departmentIds',
      label: 'fields.departments',
      collection: 'departments',
    },
    {
      key: 'categoryIds',
      label: 'fields.categories',
      collection: 'categories',
      filter: { appliesTo: 'device' },
    },
    { key: 'deviceIds', label: 'fields.devices', collection: 'devices' },
  ];
  return (
    <div className='space-y-3'>
      {scopeFields.map((field) => (
        <div key={field.key} className='grid gap-1.5'>
          <Label htmlFor={`audit-${field.key}`}>{t(field.label)}</Label>
          <MultiReferenceInput
            id={`audit-${field.key}`}
            reference={{ collection: field.collection, filter: field.filter }}
            value={value[field.key] ?? []}
            onChange={(ids) => onChange({ ...value, [field.key]: ids })}
          />
        </div>
      ))}
      <p className='text-xs text-muted-foreground'>
        {narrowed
          ? t('audits.scopePreview', { count: preview.data ?? 0 })
          : t('audits.scopeHint')}
      </p>
    </div>
  );
}

/** Create dialog with the scope pickers and the executor list. */
function AuditCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: (record: ItamRecord) => void;
}): ReactElement {
  const { t } = useTranslation();
  const mutations = useItamMutations<ItamRecord>(AUDITS_PATH);
  const [name, setName] = useState('');
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedEnd, setPlannedEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [scope, setScope] = useState<Required<AuditScope>>(() => scopeOf({}));
  const [executorIds, setExecutorIds] = useState<readonly string[]>([]);
  const narrowed = scopeNarrowed(scope);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) mutations.create.reset();
      }}
      title={t('audits.new')}
      description={t('audits.newDescription')}
      busy={mutations.create.isPending}
      error={mutations.create.error}
      disabled={
        !name.trim() ||
        !plannedStart ||
        !plannedEnd ||
        !narrowed ||
        executorIds.length === 0
      }
      confirmLabel={t('actions.create')}
      onConfirm={() =>
        void mutations.create
          .mutateAsync({
            name: name.trim(),
            plannedStart,
            plannedEnd,
            scope: scopeValue(scope),
            executorIds,
            notes: notes || null,
          })
          .then(onCreated)
      }
    >
      <div className='grid gap-1.5'>
        <Label htmlFor='audit-name'>
          {t('fields.name')} <span className='text-destructive'>*</span>
        </Label>
        <FieldInput
          id='audit-name'
          field={{ key: 'name', label: 'fields.name', type: 'text' }}
          value={name}
          onChange={(value) => setName(text(value))}
        />
      </div>
      <div className='grid grid-cols-2 gap-3'>
        <div className='grid gap-1.5'>
          <Label htmlFor='audit-start'>
            {t('fields.plannedStart')}{' '}
            <span className='text-destructive'>*</span>
          </Label>
          <FieldInput
            id='audit-start'
            field={{
              key: 'plannedStart',
              label: 'fields.plannedStart',
              type: 'date',
            }}
            value={plannedStart}
            onChange={(value) => setPlannedStart(text(value))}
          />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor='audit-end'>
            {t('fields.plannedEnd')} <span className='text-destructive'>*</span>
          </Label>
          <FieldInput
            id='audit-end'
            field={{
              key: 'plannedEnd',
              label: 'fields.plannedEnd',
              type: 'date',
            }}
            value={plannedEnd}
            onChange={(value) => setPlannedEnd(text(value))}
          />
        </div>
      </div>
      <fieldset className='space-y-3 rounded-lg border border-border bg-card p-3'>
        <legend className='px-1 text-sm font-medium'>
          {t('fields.scope')} <span className='text-destructive'>*</span>
        </legend>
        <ScopeInputs value={scope} onChange={setScope} enabled={open} />
      </fieldset>
      <div className='grid gap-1.5'>
        <Label htmlFor='audit-executors'>
          {t('fields.executors')} <span className='text-destructive'>*</span>
        </Label>
        <MultiReferenceInput
          id='audit-executors'
          reference={{ collection: 'users' }}
          value={executorIds}
          onChange={setExecutorIds}
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor='audit-notes'>{t('fields.notes')}</Label>
        <Textarea
          id='audit-notes'
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
    </ConfirmDialog>
  );
}

function AuditActions({
  record,
}: {
  readonly record: ItamRecord;
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const permissions = useCollectionPermissions('auditTasks', [
    'start',
    'finish',
    'cancel',
    'count',
  ]);
  const [dialog, setDialog] = useState<'finish' | 'cancel' | 'unregistered'>();
  /** What a counter found that the books never had, by the name it carries. */
  const [label, setLabel] = useState('');
  // What finishing hands on: "difference" covers three quite different
  // things, so the dialog counts them by name rather than in one number.
  // Same query key as the items tab, so this costs no extra request.
  const items = useQuery({
    queryKey: ['itam', AUDITS_PATH, 'items', text(record.id)],
    queryFn: async () =>
      (
        await api.request<{ data: ItamRecord[] }>({
          path: `${AUDITS_PATH}/${text(record.id)}/items`,
          query: {},
        })
      ).data,
    enabled: dialog === 'finish',
  });
  const open = (items.data ?? []).filter(
    (item) => item.resolution === 'unresolved',
  );
  const pending = {
    mismatch: open.filter((item) => item.result === 'mismatch').length,
    notFound: open.filter((item) => item.result === 'notFound').length,
    unregistered: open.filter((item) => item.result === 'unregistered').length,
  };
  const [reason, setReason] = useState('');
  const run = useMutation({
    mutationFn: async (input: {
      operation: string;
      body?: Record<string, unknown>;
    }) =>
      api.request({
        path: `${AUDITS_PATH}/${record.id}/${input.operation}`,
        method: 'POST',
        json: input.body ?? {},
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['itam'] });
      setDialog(undefined);
      setReason('');
    },
  });
  const confirm = useConfirm();
  const status = text(record.status);
  const buttons: ReactElement[] = [];
  if (permissions.start && status === 'notStarted') {
    buttons.push(
      <Button
        key='start'
        onClick={() =>
          confirm.ask({
            title: t('audits.start'),
            description: t('confirmations.startAudit'),
            confirmLabel: t('audits.start'),
            action: () => run.mutateAsync({ operation: 'start' }),
          })
        }
      >
        <Play data-icon='inline-start' />
        {t('audits.start')}
      </Button>,
    );
  }
  // Finishing marks every uncounted item as not found, which is a decision
  // about a count that is over. While anything is still uncounted the
  // button stays away: count it, or cancel the task.
  const uncounted =
    Number(record.expectedCount ?? 0) - Number(record.countedCount ?? 0);
  // Found on site with no record of its own: the count says so here, beside
  // the task's other actions, and the item it adds is settled with the rest.
  if (permissions.count && status === 'inProgress') {
    buttons.push(
      <Button
        key='unregistered'
        variant='outline'
        onClick={() => {
          run.reset();
          setLabel('');
          setDialog('unregistered');
        }}
      >
        <FilePlus2 data-icon='inline-start' />
        {t('audits.addUnregistered')}
      </Button>,
    );
  }
  if (permissions.finish && status === 'inProgress' && uncounted <= 0) {
    buttons.push(
      <Button
        key='finish'
        onClick={() => {
          run.reset();
          setDialog('finish');
        }}
      >
        <Flag data-icon='inline-start' />
        {t('audits.finish')}
      </Button>,
    );
  }
  if (
    permissions.cancel &&
    ['inProgress', 'pendingDifferences'].includes(status)
  ) {
    buttons.push(
      <Button
        key='cancel'
        variant='outline'
        onClick={() => {
          run.reset();
          setDialog('cancel');
        }}
      >
        <X data-icon='inline-start' />
        {t('audits.cancel')}
      </Button>,
    );
  }
  return (
    <>
      {confirm.dialog}
      {buttons}
      {run.error && !dialog ? (
        <span className='text-sm text-destructive'>
          {apiErrorBody(run.error)?.message ?? errorMessage(run.error)}
        </span>
      ) : null}
      <ConfirmDialog
        open={dialog === 'finish'}
        onOpenChange={(open) => !open && setDialog(undefined)}
        title={t('audits.finish')}
        // Everything has been counted by the time this can be pressed, so
        // what it decides is what happens next: what was found goes to be
        // handled, and every device counted is stamped as audited today.
        description={t(
          Number(record.differenceCount ?? 0) > 0
            ? 'audits.finishDescription'
            : 'audits.finishDescriptionClean',
          {
            counted: Number(record.countedCount ?? 0),
            pending: Number(record.differenceCount ?? 0),
            ...pending,
          },
        )}
        busy={run.isPending}
        error={run.error}
        confirmLabel={t('audits.finish')}
        onConfirm={() => run.mutate({ operation: 'finish' })}
      />
      <ConfirmDialog
        open={dialog === 'unregistered'}
        onOpenChange={(open) => !open && setDialog(undefined)}
        title={t('audits.addUnregistered')}
        description={t('audits.addUnregisteredDescription')}
        busy={run.isPending}
        error={run.error}
        disabled={!label.trim()}
        confirmLabel={t('actions.add')}
        onConfirm={() =>
          void run
            .mutateAsync({
              operation: 'add-unregistered',
              body: { label: label.trim() },
            })
            .then(() => setLabel(''))
        }
      >
        <div className='grid gap-1.5'>
          <Label htmlFor='unregistered-label'>{t('fields.name')}</Label>
          <Input
            id='unregistered-label'
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'cancel'}
        onOpenChange={(open) => !open && setDialog(undefined)}
        title={t('audits.cancel')}
        busy={run.isPending}
        error={run.error}
        disabled={!reason.trim()}
        destructive
        confirmLabel={t('audits.cancel')}
        onConfirm={() => run.mutate({ operation: 'cancel', body: { reason } })}
      >
        <div className='grid gap-1.5'>
          <Label htmlFor='audit-cancel-reason'>
            {t('fields.reason')} <span className='text-destructive'>*</span>
          </Label>
          <Textarea
            id='audit-cancel-reason'
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </ConfirmDialog>
    </>
  );
}

export function AuditAttachmentsTab(): ReactElement {
  const { id = '' } = useParams();
  return <AttachmentsTab ownerType='auditTasks' ownerId={id} />;
}
