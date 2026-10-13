import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, SearchX, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState, type ReactElement } from 'react';
import { useParams } from 'react-router';

import { HolderCell } from '@/components/itam/holder-link';
import { AuditGrouping } from '@/components/itam/ai/audit-grouping';
import { ReferenceLink } from '@/components/itam/cells';
import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { EmptyState } from '@/components/itam/empty-state';
import { Pagination } from '@/components/itam/pagination';
import { FieldInput } from '@/components/itam/field-input';
import { DeviceStatusBadge } from '@/components/itam/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  apiErrorBody,
  masterDataPath,
  useApi,
  useItamRecord,
  type ItamRecord,
} from '@/lib/itam/api';
import { deviceLabel, errorMessage, formatDate, text } from '@/lib/itam/format';
import { usePagedRows } from '@/lib/itam/paging';
import { AUDITS_PATH, AUDIT_DIFFERENCES } from '@/lib/itam/operations';
import { useCollectionPermissions } from '@/lib/itam/permissions';
import { ASSIGNEE_TYPES, DEVICE_FIELDS } from '@/lib/itam/devices';
import { resolveFormField } from '@/lib/itam/fields';
import { useReferenceNames } from '@/lib/itam/references';

const DEVICE_STATUSES = [
  'inStock',
  'inUse',
  'onLoan',
  'inRepair',
  'retired',
  'pendingDisposal',
  'lost',
];

/** The parts of a meta line, with `·` between them and never before one. */
function Separated({
  parts,
}: {
  readonly parts: readonly ReactNode[];
}): ReactElement {
  const shown = parts.filter(
    (part) => part !== null && part !== undefined && part !== '',
  );
  return (
    <>
      {shown.map((part, index) => (
        // The parts of one line, in the order they are written above.
        // eslint-disable-next-line @eslint-react/no-array-index-key -- the order is the identity
        <span key={index} className='inline-flex items-center gap-1'>
          {index > 0 ? <span className='opacity-60'>·</span> : null}
          {part}
        </span>
      ))}
    </>
  );
}

/**
 * What registering an unregistered item asks for: the device page's own
 * create fields, minus the two that follow the model.
 */
const REGISTER_FIELDS = [
  'name',
  'modelId',
  'serialNo',
  'locationId',
  'departmentId',
  'ownership',
  'vendorId',
  'purchasePrice',
  'purchaseDate',
  'warrantyEndDate',
  'notes',
  'ownerId',
] as const;
const REGISTER_REQUIRED: readonly string[] = ['modelId', 'locationId'];

/**
 * The results a reader filters by: the three a count answers with, and what
 * the count found that the books never had.
 */
const RESULT_FILTERS = [
  'matched',
  'notFound',
  'mismatch',
  'unregistered',
] as const;

/** Tab: every item of the task; counting while in progress, resolution afterwards. */
export default function AuditItemsTab(): ReactElement {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const api = useApi();
  const queryClient = useQueryClient();
  const task = useItamRecord<ItamRecord>(AUDITS_PATH, id);
  const permissions = useCollectionPermissions('auditTasks', [
    'count',
    'resolve',
  ]);
  const [resultFilter, setResultFilter] = useState<string>('');
  const [progressFilter, setProgressFilter] = useState<
    '' | 'counted' | 'uncounted'
  >('');
  const items = useQuery({
    queryKey: ['itam', AUDITS_PATH, 'items', id],
    queryFn: async () =>
      (
        await api.request<{ data: ItamRecord[] }>({
          path: `${AUDITS_PATH}/${id}/items`,
          query: {},
        })
      ).data,
  });
  const rows = items.data ?? [];
  const names = useReferenceNames([
    {
      collection: 'locations',
      ids: rows.flatMap((row) => [
        text(row.bookLocationId),
        text(row.actualLocationId),
        row.bookAssigneeType === 'location' ? text(row.bookAssigneeId) : '',
        row.actualAssigneeType === 'location' ? text(row.actualAssigneeId) : '',
      ]),
    },
    {
      collection: 'people',
      ids: rows.flatMap((row) => [
        row.bookAssigneeType === 'person' ? text(row.bookAssigneeId) : '',
        (row.actualAssigneeType ?? 'person') === 'person'
          ? text(row.actualAssigneeId)
          : '',
      ]),
    },
    // A device booked to, or found in, a place or another device names it
    // the same way.
    {
      collection: 'devices',
      ids: rows.flatMap((row) => [
        row.bookAssigneeType === 'device' ? text(row.bookAssigneeId) : '',
        row.actualAssigneeType === 'device' ? text(row.actualAssigneeId) : '',
      ]),
    },
    { collection: 'users', ids: rows.map((row) => text(row.countedById)) },
  ]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['itam'] });
  const run = useMutation({
    mutationFn: (input: { operation: string; body: Record<string, unknown> }) =>
      api.request({
        path: `${AUDITS_PATH}/${id}/${input.operation}`,
        method: 'POST',
        json: input.body,
      }),
    onSuccess: refresh,
  });
  const status = text(task.data?.status);
  const counting = status === 'inProgress' && Boolean(permissions.count);
  const resolving =
    status === 'pendingDifferences' && Boolean(permissions.resolve);

  const [countItem, setCountItem] = useState<ItamRecord>();
  const [countValues, setCountValues] = useState<Record<string, unknown>>({});
  const [resolveItem, setResolveItem] = useState<ItamRecord>();
  const [resolveValues, setResolveValues] = useState<Record<string, unknown>>(
    {},
  );
  const [scan, setScan] = useState('');
  /** The box is a scanner and a search at once: what is typed narrows the
      list, and submitting it counts that code. */
  const searched = scan.trim().toLowerCase();
  const shown = rows.filter(
    (row) =>
      (!searched ||
        [row.deviceNo, row.deviceName, row.label, row.serialNo].some((value) =>
          text(value).toLowerCase().includes(searched),
        )) &&
      (!resultFilter || text(row.result) === resultFilter) &&
      (progressFilter === '' ||
        (progressFilter === 'uncounted'
          ? row.result === 'notCounted'
          : row.result !== 'notCounted')),
  );
  const paged = usePagedRows(shown);

  /**
   * Which of the counted values repeat the books. A difference is what
   * differs, so every value the counter states has to be one — the service
   * refuses the others, and the dialog says which before it is sent.
   */
  const sameAsBook = (key: string): boolean => {
    if (!countItem) return false;
    if (key === 'actualLocationId')
      return (
        Boolean(countValues.actualLocationId) &&
        text(countValues.actualLocationId) === text(countItem.bookLocationId)
      );
    if (key === 'actualAssigneeId')
      return (
        Boolean(countValues.actualAssigneeId) &&
        text(countValues.actualAssigneeId) === text(countItem.bookAssigneeId) &&
        (text(countValues.actualAssigneeType) || 'person') ===
          text(countItem.bookAssigneeType)
      );
    if (key === 'actualStatus')
      return (
        Boolean(countValues.actualStatus) &&
        text(countValues.actualStatus) === text(countItem.bookStatus)
      );
    return false;
  };
  const countedSomething = Boolean(
    countValues.actualLocationId ??
    countValues.actualAssigneeId ??
    countValues.actualStatus,
  );
  const countRepeatsBook = [
    'actualLocationId',
    'actualAssigneeId',
    'actualStatus',
  ].some((key) => sameAsBook(key));
  const countDiffers = countedSomething && !countRepeatsBook;

  const registerModel = useItamRecord<ItamRecord>(
    masterDataPath('models'),
    resolveValues.resolution === 'register' && resolveValues.modelId
      ? text(resolveValues.modelId)
      : undefined,
  );
  const modelNames = useReferenceNames([
    {
      collection: 'categories',
      ids: [text(registerModel.data?.categoryId)],
    },
    {
      collection: 'manufacturers',
      ids: [text(registerModel.data?.manufacturerId)],
    },
  ]);

  /** Settles the item being handled, with the values the dialog collected. */
  const resolve = async (values: Record<string, unknown>) => {
    if (!resolveItem) return;
    await run.mutateAsync({
      operation: 'resolve',
      body: {
        items: [
          {
            itemId: resolveItem.id,
            ...Object.fromEntries(
              Object.entries(values).filter(([, value]) => value),
            ),
          },
        ],
      },
    });
    setResolveItem(undefined);
  };

  /** Which collection names a holder of this kind. */
  const collectionOfHolder = (type: string): string =>
    type === 'person'
      ? 'people'
      : type === 'location'
        ? 'locations'
        : 'devices';

  /** What the books say for the field a counter is answering. */
  const bookedValue = (
    key: string,
    row: ItamRecord | undefined,
    loaded: typeof names,
  ): ReactNode => {
    if (!row) return null;
    if (key === 'actualLocationId')
      return row.bookLocationId
        ? (loaded.locations?.get(text(row.bookLocationId)) ?? '…')
        : '—';
    if (key === 'actualAssigneeId')
      return row.bookAssigneeType && row.bookAssigneeId ? (
        <HolderCell
          holderType={text(row.bookAssigneeType)}
          holderId={text(row.bookAssigneeId)}
          names={loaded[collectionOfHolder(text(row.bookAssigneeType))]}
        />
      ) : (
        '—'
      );
    if (key === 'actualStatus')
      return row.bookStatus ? (
        <DeviceStatusBadge status={row.bookStatus} />
      ) : (
        '—'
      );
    return null;
  };

  const resultBadge = (row: ItamRecord) => (
    <Badge
      variant={
        AUDIT_DIFFERENCES.includes(text(row.result))
          ? 'destructive'
          : 'secondary'
      }
      // Counted and matching: the one result that says nothing is wrong.
      className={
        row.result === 'matched'
          ? 'bg-success text-success-foreground'
          : undefined
      }
    >
      {t(`enums.auditResult.${text(row.result)}`, {
        defaultValue: text(row.result),
      })}
    </Badge>
  );

  return (
    <div className='space-y-3'>
      <div className='flex w-full flex-wrap items-center gap-x-6 gap-y-2 text-sm'>
        {/* How far the count has got, what it found, and the box that finds
            a device in it: one line, in the order a counter uses them. */}
        {status !== 'notStarted' ? (
          <span className='flex flex-wrap items-center gap-1 text-muted-foreground'>
            <span className='font-medium text-foreground'>
              {t('audits.progress')}:
            </span>
            {(
              [
                ['', 'audits.allItems', Number(task.data?.expectedCount ?? 0)],
                [
                  'counted',
                  'audits.counted',
                  Number(task.data?.countedCount ?? 0),
                ],
                [
                  'uncounted',
                  'audits.uncounted',
                  Number(task.data?.expectedCount ?? 0) -
                    Number(task.data?.countedCount ?? 0),
                ],
              ] as const
            ).map(([value, label, count], index) => (
              <span key={label} className='flex items-center gap-1'>
                {index > 0 ? <span className='opacity-40'>|</span> : null}
                <button
                  type='button'
                  aria-pressed={progressFilter === value}
                  className={
                    progressFilter === value
                      ? 'rounded-md bg-accent px-1.5 py-0.5 font-medium text-foreground'
                      : 'rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground'
                  }
                  onClick={() => setProgressFilter(value)}
                >
                  {t(label)} {count}
                </button>
              </span>
            ))}
          </span>
        ) : null}
        {/* Nothing to filter before the task has items; once a filter is on,
            it stays so an empty result can be cleared. */}
        {status !== 'notStarted' && (resultFilter || rows.length > 0) ? (
          <span className='flex flex-wrap items-center gap-1 text-muted-foreground'>
            <span className='font-medium text-foreground'>
              {t('audits.resultFilter')}:
            </span>
            {RESULT_FILTERS.map((value, index) => (
              <span key={value} className='flex items-center gap-1'>
                {index > 0 ? <span className='opacity-40'>|</span> : null}
                <button
                  type='button'
                  aria-pressed={resultFilter === value}
                  className={
                    resultFilter === value
                      ? 'rounded-md bg-accent px-1.5 py-0.5 font-medium text-foreground'
                      : 'rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground'
                  }
                  onClick={() =>
                    setResultFilter(resultFilter === value ? '' : value)
                  }
                >
                  {t(`enums.auditResult.${value}`)}{' '}
                  {rows.filter((row) => row.result === value).length}
                </button>
              </span>
            ))}
          </span>
        ) : null}
        {status !== 'notStarted' ? (
          <div className='flex min-w-56 flex-1 items-center gap-2'>
            <span className='font-medium text-foreground'>
              {t('references.devices')}:
            </span>
            <Input
              value={scan}
              onChange={(event) => setScan(event.target.value)}
              placeholder={t('audits.searchPlaceholder')}
              aria-label={t('common.search')}
              className='min-w-0 flex-1'
            />
          </div>
        ) : null}
      </div>
      {run.error ? (
        <span className='text-sm text-destructive'>
          {apiErrorBody(run.error)?.message ?? errorMessage(run.error)}
        </span>
      ) : null}
      {resolving ? (
        <AuditGrouping
          auditId={id}
          auditName={text(task.data?.name) || id}
          differences={
            rows.filter(
              (row) =>
                AUDIT_DIFFERENCES.includes(text(row.result)) &&
                row.resolution === 'unresolved',
            ).length
          }
        />
      ) : null}
      {status === 'notStarted' && rows.length > 0 ? (
        <p className='text-xs text-muted-foreground'>
          {t('audits.previewNotice', { count: rows.length })}
        </p>
      ) : null}
      {items.data && rows.length === 0 ? (
        <EmptyState
          title={t(
            status === 'notStarted'
              ? 'audits.noScopeDevices'
              : 'audits.noItems',
          )}
        />
      ) : (
        <ul className='divide-y divide-border rounded-lg border border-border bg-card text-sm'>
          {paged.rows.map((row) => {
            const difference =
              AUDIT_DIFFERENCES.includes(text(row.result)) &&
              row.resolution === 'unresolved';
            return (
              <li
                key={row.id}
                className='flex flex-wrap items-center justify-between gap-2 px-3 py-2'
              >
                <div className='space-y-0.5'>
                  <div className='flex flex-wrap items-center gap-2'>
                    {row.deviceId ? (
                      <ReferenceLink
                        collection='devices'
                        route='devices'
                        id={row.deviceId}
                        names={
                          new Map([
                            [
                              text(row.deviceId),
                              deviceLabel({
                                deviceNo: row.deviceNo,
                                name: row.deviceName,
                              }),
                            ],
                          ])
                        }
                      />
                    ) : (
                      <span className='font-medium'>{text(row.label)}</span>
                    )}
                    {row.bookStatus ? (
                      <DeviceStatusBadge status={row.bookStatus} />
                    ) : null}
                    {/* A preview row has not been counted, nor can it be.
                        While counting, the buttons on the right carry the
                        result instead of a tag here. */}
                    {row.preview || (counting && row.deviceId)
                      ? null
                      : resultBadge(row)}
                    {row.resolution !== 'unresolved' &&
                    row.result !== 'matched' ? (
                      <Badge variant='outline'>
                        {t(`enums.auditResolution.${text(row.resolution)}`, {
                          defaultValue: text(row.resolution),
                        })}
                      </Badge>
                    ) : null}
                  </div>
                  <div className='flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground'>
                    {/* The separator belongs between the parts, not before
                        the first one: an account-less item starts at its
                        counter, with nothing on its left. */}
                    <Separated
                      parts={[
                        row.bookLocationId
                          ? `${t('fields.bookLocation')}: ${names.locations?.get(text(row.bookLocationId)) ?? ''}`
                          : null,
                        // Where the books say the device went: to a person, a
                        // place or another device, each with its own icon, so
                        // the counter sees what kind of holder to look for.
                        row.bookAssigneeType && row.bookAssigneeId ? (
                          <span
                            key='bookAssignee'
                            className='inline-flex items-center gap-1'
                          >
                            {t('fields.bookAssignee')}:
                            <HolderCell
                              holderType={text(row.bookAssigneeType)}
                              holderId={text(row.bookAssigneeId)}
                              names={
                                names[
                                  collectionOfHolder(text(row.bookAssigneeType))
                                ]
                              }
                            />
                          </span>
                        ) : null,
                        // Finishing the task marks what nobody counted as not
                        // found, with a time and no counter.
                        row.countedById
                          ? `${t('fields.countedBy')}: ${names.users?.get(text(row.countedById)) ?? ''}`
                          : null,
                        row.countedAt ? formatDate(row.countedAt, true) : null,
                        // A matching item is settled the moment it is counted;
                        // only a difference has a resolution time of its own.
                        row.resolvedAt &&
                        AUDIT_DIFFERENCES.includes(text(row.result))
                          ? `${t('fields.resolvedAt')}: ${formatDate(row.resolvedAt, true)}`
                          : null,
                        row.notes ? text(row.notes) : null,
                      ]}
                    />
                  </div>
                  {/* What the count found reads on a line of its own: it is
                      the answer to the line above it, not more of it. */}
                  {row.actualLocationId ||
                  row.actualAssigneeId ||
                  row.actualStatus ? (
                    <div className='flex flex-wrap items-center gap-x-1 text-xs text-foreground'>
                      {row.actualLocationId
                        ? `${t('fields.actualLocation')}: ${names.locations?.get(text(row.actualLocationId)) ?? ''}`
                        : ''}
                      {row.actualAssigneeId ? (
                        <span className='inline-flex items-center gap-1'>
                          {row.actualLocationId ? '·' : null}
                          {t('fields.actualAssignee')}:
                          <HolderCell
                            holderType={
                              text(row.actualAssigneeType) || 'person'
                            }
                            holderId={text(row.actualAssigneeId)}
                            names={
                              names[
                                collectionOfHolder(
                                  text(row.actualAssigneeType) || 'person',
                                )
                              ]
                            }
                          />
                        </span>
                      ) : null}
                      {row.actualStatus ? (
                        <span className='inline-flex items-center gap-1'>
                          {row.actualLocationId || row.actualAssigneeId
                            ? '·'
                            : null}
                          {t('fields.actualStatus')}:
                          <DeviceStatusBadge status={row.actualStatus} />
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className='flex items-center gap-1.5'>
                  {counting && row.deviceId ? (
                    <>
                      {/* Already counted as matching: the tag says so, and
                          counting it again changes nothing. Recording a
                          difference stays, for a count to correct. */}
                      {/* The three answers a count can give, and which one
                          it gave: the chosen one is filled in, green when
                          nothing is wrong. */}
                      <Button
                        size='sm'
                        variant='outline'
                        className={
                          row.result === 'matched'
                            ? 'border-transparent bg-success text-success-foreground hover:bg-success hover:text-success-foreground'
                            : undefined
                        }
                        disabled={run.isPending}
                        onClick={() =>
                          run.mutate({
                            operation: 'count',
                            body: {
                              items: [{ itemId: row.id, result: 'matched' }],
                            },
                          })
                        }
                      >
                        <Check data-icon='inline-start' />
                        {t('enums.auditResult.matched')}
                      </Button>
                      <Button
                        size='sm'
                        variant={
                          row.result === 'notFound' ? 'destructive' : 'outline'
                        }
                        disabled={run.isPending}
                        onClick={() =>
                          run.mutate({
                            operation: 'count',
                            body: {
                              items: [{ itemId: row.id, result: 'notFound' }],
                            },
                          })
                        }
                      >
                        <SearchX data-icon='inline-start' />
                        {t('enums.auditResult.notFound')}
                      </Button>
                      <Button
                        size='sm'
                        variant={
                          row.result === 'mismatch' ? 'destructive' : 'outline'
                        }
                        onClick={() => {
                          run.reset();
                          // Recording it again starts from what was
                          // recorded: the counter is correcting an answer,
                          // not giving a new one from nothing.
                          setCountValues({
                            result: 'mismatch',
                            actualLocationId: row.actualLocationId ?? null,
                            actualAssigneeId: row.actualAssigneeId ?? null,
                            actualAssigneeType:
                              row.actualAssigneeType ?? 'person',
                            actualStatus: row.actualStatus ?? null,
                            notes: row.notes ?? '',
                          });
                          setCountItem(row);
                        }}
                      >
                        <TriangleAlert data-icon='inline-start' />
                        {t('audits.recordDifference')}
                      </Button>
                    </>
                  ) : null}
                  {resolving && difference ? (
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => {
                        run.reset();
                        setResolveValues({
                          resolution:
                            row.result === 'unregistered'
                              ? 'register'
                              : row.result === 'notFound'
                                ? 'markLost'
                                : 'updateToActual',
                          // What the counter called it, to be kept or
                          // changed while it is registered.
                          ...(row.result === 'unregistered'
                            ? { name: text(row.label) }
                            : {}),
                        });
                        setResolveItem(row);
                      }}
                    >
                      {t('audits.resolve')}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {paged.pagination ? <Pagination {...paged.pagination} /> : null}

      <ConfirmDialog
        open={Boolean(countItem)}
        onOpenChange={(open) => !open && setCountItem(undefined)}
        title={t('audits.recordDifference')}
        description={text(countItem?.deviceNo)}
        busy={run.isPending}
        error={run.error}
        disabled={!countDiffers}
        confirmLabel={t('actions.save')}
        onConfirm={() =>
          countItem &&
          void run
            .mutateAsync({
              operation: 'count',
              body: {
                items: [
                  {
                    itemId: countItem.id,
                    ...Object.fromEntries(
                      Object.entries(countValues).filter(([, value]) => value),
                    ),
                  },
                ],
              },
            })
            .then(() => setCountItem(undefined))
        }
      >
        {/* Emptying every field is not a difference, so there is nothing
            to save: the answer it leaves is one of the other two buttons. */}
        {countedSomething ? null : (
          <p className='text-xs text-muted-foreground'>
            {t('audits.nothingCounted')}
          </p>
        )}
        {[
          // No result to pick: this dialog records a difference, and what
          // differs is whichever of the three below the counter fills in.
          {
            key: 'actualLocationId',
            label: 'fields.actualLocation',
            type: 'reference' as const,
            reference: { collection: 'locations' },
          },
          {
            key: 'actualAssigneeId',
            label: 'fields.actualAssignee',
            type: 'reference' as const,
            reference: {
              collection: collectionOfHolder(
                text(countValues.actualAssigneeType) || 'person',
              ),
            },
          },
          {
            key: 'actualStatus',
            label: 'fields.actualStatus',
            type: 'select' as const,
            options: DEVICE_STATUSES.map((value) => ({
              value,
              label: `enums.deviceStatus.${value}`,
            })),
          },
          { key: 'notes', label: 'fields.notes', type: 'text' as const },
        ].map((field) => {
          // What the books say, beside what the counter found: the counter
          // is comparing, so the two read side by side rather than one of
          // them living a scroll away on the page behind.
          const booked = bookedValue(field.key, countItem, names);
          const input = (
            <FieldInput
              id={`count-${field.key}`}
              field={field}
              value={countValues[field.key]}
              onChange={(value) =>
                setCountValues((current) => ({
                  ...current,
                  [field.key]: value,
                }))
              }
            />
          );
          // A device may be found with a person, in a place or inside
          // another device, so the holder is asked as a kind and a target.
          const control =
            field.key === 'actualAssigneeId' ? (
              <div className='flex gap-2'>
                <div className='w-24 shrink-0'>
                  <FieldInput
                    id='count-actualAssigneeType'
                    field={{
                      key: 'actualAssigneeType',
                      label: 'fields.assigneeType',
                      type: 'select',
                      required: true,
                      options: ASSIGNEE_TYPES.map((value) => ({
                        value,
                        label: `enums.assigneeType.${value}`,
                      })),
                    }}
                    value={countValues.actualAssigneeType ?? 'person'}
                    onChange={(value) =>
                      setCountValues((current) => ({
                        ...current,
                        actualAssigneeType: value,
                        actualAssigneeId: null,
                      }))
                    }
                  />
                </div>
                <div className='min-w-0 flex-1'>{input}</div>
              </div>
            ) : (
              input
            );
          return (
            <div key={field.key} className='grid gap-1.5'>
              <Label htmlFor={`count-${field.key}`}>{t(field.label)}</Label>
              {booked ? (
                <div className='flex items-center gap-2'>
                  <span className='flex min-w-0 flex-1 items-center gap-1 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground'>
                    {t('audits.bookValue')}:&nbsp;{booked}
                  </span>
                  <div className='min-w-0 flex-1'>{control}</div>
                </div>
              ) : (
                control
              )}
              {sameAsBook(field.key) ? (
                <p className='text-xs text-destructive'>
                  {t('audits.sameAsBook')}
                </p>
              ) : null}
            </div>
          );
        })}
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(resolveItem)}
        onOpenChange={(open) => !open && setResolveItem(undefined)}
        title={t('audits.resolve')}
        // Which item is being settled, named the way its row names it. The
        // result is not repeated here: the row carries it, and what this
        // dialog offers already follows from it.
        description={
          resolveItem
            ? resolveItem.deviceId
              ? deviceLabel({
                  deviceNo: resolveItem.deviceNo,
                  name: resolveItem.deviceName,
                })
              : text(resolveItem.label)
            : ''
        }
        busy={run.isPending}
        error={run.error}
        // What registering needs blocks registering, not the choice to
        // leave the record as it stands.
        confirmDisabled={
          resolveValues.resolution === 'register' &&
          (!resolveValues.modelId || !resolveValues.locationId)
        }
        // Each result has one way of being settled, so the dialog offers
        // that one — and, beside it, leaving the record as it stands.
        confirmLabel={t(
          `enums.auditResolution.${text(resolveValues.resolution)}`,
        )}
        onConfirm={() => void resolve(resolveValues)}
        secondaryLabel={t('enums.auditResolution.markVerified')}
        onSecondary={() => void resolve({ resolution: 'markVerified' })}
      >
        {/* Registering what the count found builds a device, so it asks
            what the device page asks; the name starts at what the counter
            called it and can be changed. Category and maker follow the
            model, which the service derives. */}
        {resolveValues.resolution === 'register'
          ? REGISTER_FIELDS.map((key) => {
              const field = DEVICE_FIELDS.find((entry) => entry.key === key);
              if (!field) return null;
              const resolved = resolveFormField(field, resolveValues);
              return (
                <div key={key} className='grid gap-1.5'>
                  <Label htmlFor={`resolve-${key}`}>
                    {t(resolved.label)}
                    {REGISTER_REQUIRED.includes(key) ? (
                      <span className='text-destructive'> *</span>
                    ) : null}
                  </Label>
                  <FieldInput
                    id={`resolve-${key}`}
                    field={resolved}
                    value={resolveValues[key]}
                    onChange={(value) =>
                      setResolveValues((current) => ({
                        ...current,
                        [key]: value,
                      }))
                    }
                  />
                  {/* What the model decides reads right under it, as it
                      does on the device form: not asked for, because the
                      service takes both from the model either way. */}
                  {key === 'modelId' && registerModel.data
                    ? (
                        [
                          ['fields.category', 'categories', 'categoryId'],
                          [
                            'fields.manufacturer',
                            'manufacturers',
                            'manufacturerId',
                          ],
                        ] as const
                      ).map(([label, collection, modelKey]) => (
                        <div key={modelKey} className='grid gap-1.5'>
                          <Label>{t(label)}</Label>
                          <p className='rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-muted-foreground'>
                            {modelNames[collection]?.get(
                              text(registerModel.data?.[modelKey]),
                            ) ?? '—'}
                          </p>
                        </div>
                      ))
                    : null}
                </div>
              );
            })
          : null}
        {/* Writing the count back asks for nothing: it says what it will
            write, which is what the counter already recorded. */}
        {resolveValues.resolution === 'updateToActual' && resolveItem ? (
          <dl className='grid gap-1.5 rounded-lg border border-border bg-muted/40 p-3 text-xs'>
            {[
              resolveItem.actualLocationId
                ? ([
                    'actualLocationId',
                    'fields.location',
                    names.locations?.get(text(resolveItem.actualLocationId)) ??
                      '…',
                  ] as const)
                : null,
              resolveItem.actualAssigneeId
                ? ([
                    'actualAssigneeId',
                    'fields.assignee',
                    <HolderCell
                      key='holder'
                      holderType={
                        text(resolveItem.actualAssigneeType) || 'person'
                      }
                      holderId={text(resolveItem.actualAssigneeId)}
                      names={
                        names[
                          collectionOfHolder(
                            text(resolveItem.actualAssigneeType) || 'person',
                          )
                        ]
                      }
                    />,
                  ] as const)
                : null,
              resolveItem.actualStatus
                ? ([
                    'actualStatus',
                    'fields.status',
                    <DeviceStatusBadge
                      key='status'
                      status={resolveItem.actualStatus}
                    />,
                  ] as const)
                : null,
            ]
              .filter((row) => row !== null)
              .map(([key, label, value]) => (
                <div key={key} className='flex flex-wrap items-center gap-2'>
                  <dt className='text-muted-foreground'>{t(label)}</dt>
                  <dd className='flex flex-wrap items-center gap-2'>
                    {/* What the books say, and what it becomes. */}
                    <span className='flex items-center gap-1 text-muted-foreground'>
                      {bookedValue(key, resolveItem, names)}
                    </span>
                    <ArrowRight className='size-3 text-muted-foreground' />
                    <span className='flex items-center gap-1 font-medium'>
                      {value}
                    </span>
                  </dd>
                </div>
              ))}
          </dl>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
