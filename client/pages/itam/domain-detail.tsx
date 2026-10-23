import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import {
  Fragment,
  useContext,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router';

import { FieldValue } from '@/components/itam/cells';
import { DeleteDialog } from '@/components/itam/delete-dialog';
import {
  DetailPage,
  InfoCard,
  InfoSection,
  InfoRow,
} from '@/components/itam/detail-page';
import { EmptyState } from '@/components/itam/empty-state';
import { ExtendedFields } from '@/components/itam/extended-fields';
import { FieldLabel } from '@/components/itam/field-label';
import { InlineField } from '@/components/itam/inline-field';
import { RecordImage } from '@/components/itam/record-image';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  apiErrorBody,
  useApi,
  useDeleteImpact,
  useItamMutations,
  useItamRecord,
  useRelatedCounts,
  useRowCounts,
  type ItamRecord,
} from '@/lib/itam/api';
import { attachmentCount, useAttachmentGroups } from '@/lib/itam/attachments';
import { useAiPageContext } from '@/lib/itam/ai-chat';
import { HideBreadcrumbContext } from '@/lib/itam/detail-chrome';
import { recordKindOf } from '@/lib/itam/record-kind';
import type { DomainConfig } from '@/lib/itam/domain';
import { resolveFormField, type FieldDefinition } from '@/lib/itam/fields';
import { errorMessage, formatDate, text } from '@/lib/itam/format';
import { masterDataByName } from '@/lib/itam/master-data';
import {
  useCollectionPermissions,
  useCurrentUserId,
} from '@/lib/itam/permissions';
import { referenceRoute, useReferenceNames } from '@/lib/itam/references';
import { STOCK_ROUTES, type StockKind } from '@/lib/itam/stock';

/** Generic detail page: summary, grouped inline-editable fields, tabs. */

/**
 * 负责人 is the first row of 基本信息 on every record that has one
 * (2026-10-05): who answers for the record is read before what it is
 * about, and handed over in place. It used to sit at the foot of 系统, with
 * the stamps nobody edits, which is why it went unseen.
 */
const OWNER_FIRST = -1000;

export function DomainDetailPage({
  domain,
}: {
  readonly domain: DomainConfig;
}): ReactElement {
  const { t } = useTranslation();
  const hideBreadcrumb = useContext(HideBreadcrumbContext);
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const record = useItamRecord<ItamRecord>(domain.path, id);
  const mutations = useItamMutations<ItamRecord>(domain.path);
  const permissions = useCollectionPermissions(domain.name, [
    'update',
    'delete',
  ]);
  // Above the early returns: a record whose edits belong to the person who
  // raised it needs to know who is reading (`editable` takes it).
  const currentUserId = useCurrentUserId();
  const [deleting, setDeleting] = useState(false);
  const impact = useDeleteImpact(domain.path, deleting ? id : undefined);
  const data = record.data;
  const api = useApi();
  // A record the tabs depend on (a model's category), and one answer that
  // counts several tabs (a master-data record's stats).
  const related = useItamRecord<ItamRecord>(
    domain.relatedRecord?.path ?? '',
    data && domain.relatedRecord ? domain.relatedRecord.id(data) : undefined,
  );
  const tabCountsRequest = domain.tabCounts?.(id);
  const tabCountsAnswer = useQuery({
    queryKey: tabCountsRequest?.queryKey ?? ['itam', domain.path, id, 'none'],
    enabled: Boolean(tabCountsRequest && id),
    queryFn: async () =>
      (
        await api.request<{ data: unknown }>({
          path: tabCountsRequest?.path ?? '',
        })
      ).data,
  });
  const attachments = useAttachmentGroups(
    domain.name,
    domain.tabs?.some((tab) => tab.key === 'attachments') ? id : undefined,
  );
  // Tabs that name a related list show its row count.
  const countedTabs = (domain.tabs ?? []).filter((tab) => tab.count);
  const relatedCounts = useRelatedCounts(
    countedTabs.map((tab) => {
      const related = tab.count!(data ?? { id });
      return { path: related.path, query: { filter: related.filter } };
    }),
  );
  // A tab may count several lists; each tab keeps the slice of requests it
  // added, and its badge is their sum once any has arrived.
  const rowCountedTabs = (domain.tabs ?? []).filter((tab) => tab.countBy);
  const rowCountRequests = rowCountedTabs.map((tab) => {
    const requests = tab.countBy!(data ?? { id });
    return 'path' in requests ? [requests] : requests;
  });
  const flatRowCounts = useRowCounts(rowCountRequests.flat());
  const rowCounts = rowCountRequests.map((requests, index) => {
    const start = rowCountRequests
      .slice(0, index)
      .reduce((sum, earlier) => sum + earlier.length, 0);
    const counts = flatRowCounts.slice(start, start + requests.length);
    return counts.every((count) => count === undefined)
      ? undefined
      : counts.reduce<number>((sum, count) => sum + (count ?? 0), 0);
  });

  const referenceRequests = useMemo(
    () =>
      domain.fields
        .filter((field) => field.type === 'reference' && field.reference)
        .map((field) => ({
          collection: field.reference!.collection,
          ids: [data?.[field.key] as string | null],
        })),
    [domain.fields, data],
  );
  const names = useReferenceNames(referenceRequests);
  // The record this page shows, offered to the assistant: its chip sits in
  // the chat's composer, and the ask box at the bottom of the page asks
  // about it (2026-10-16, after NocoCRM's).
  const recordKind = recordKindOf(domain.path);
  useAiPageContext(
    recordKind && data
      ? {
          kind: recordKind,
          id,
          label: text(data[domain.nameField]) || id,
        }
      : null,
  );
  const nameOf = (collection: string, value: unknown) =>
    value ? names[collection]?.get(text(value)) : undefined;

  if (record.isLoading) {
    return (
      <section className='mx-auto w-full max-w-7xl space-y-4 p-6'>
        <Skeleton className='h-8 w-1/3' />
        <Skeleton className='h-24 w-full' />
      </section>
    );
  }
  if (record.error || !data) {
    return (
      <section className='mx-auto w-full max-w-7xl p-6'>
        <EmptyState
          title={t('common.notFound')}
          action={
            <Button
              variant='outline'
              onClick={() => void navigate(`/${domain.route}`)}
            >
              {t('common.backToList')}
            </Button>
          }
        />
      </section>
    );
  }

  const objectLabel = t(`${domain.i18n}.object`);
  const groups = new Map<string, FieldDefinition[]>();
  // A currency shown with its amount (a money field's `currencyField`) has no
  // row of its own: the amount's editor carries the selector, the way the
  // create dialog and the record drawer already show the pair.
  const paired = new Set(
    domain.fields.map((field) => field.currencyField).filter(Boolean),
  );
  for (const field of domain.fields) {
    // The name is edited in the title.
    if (
      field.key === domain.nameField ||
      field.detail === false ||
      paired.has(field.key) ||
      field.visibleWhen?.(data) === false
    )
      continue;
    if (field.key === 'ownerId') {
      groups.set('groups.basic', [
        ...(groups.get('groups.basic') ?? []),
        { ...field, group: 'groups.basic', detailOrder: OWNER_FIRST },
      ]);
      continue;
    }
    const group = field.group ?? 'groups.basic';
    groups.set(group, [...(groups.get(group) ?? []), field]);
  }
  const Actions = domain.Actions;
  const Notice = domain.Notice;
  const Decisions = domain.Decisions;
  const Aside = domain.Aside;
  const InfoLead = domain.InfoLead;
  const BasicLead = domain.BasicLead;
  const currency = text(data.currency);
  const BreadcrumbTrail = domain.BreadcrumbTrail;
  const prefixField = domain.fields.find(
    (field) => field.key === domain.titlePrefixField,
  );
  const titlePrefix =
    prefixField?.reference && data[prefixField.key]
      ? (nameOf(prefixField.reference.collection, data[prefixField.key]) ?? '')
      : '';
  const editable =
    Boolean(permissions.update) &&
    (domain.editable?.(data, currentUserId) ?? true);

  // One field's inline editor: the information card renders its rows with
  // it, and the summary strip renders 负责人 with it (2026-10-05), so both
  // follow the same rules and save the same way.
  const inlineField = (field: FieldDefinition): ReactElement => (
    <InlineField
      // Dependent constraints resolved against this record,
      // so a field required for it (a perpetual
      // entitlement's licensing model) offers no empty
      // choice the server would then refuse.
      field={resolveFormField(field, data)}
      // A field that edits two halves at once passes the
      // pair: an amount with its currency, a reference
      // that may be free text, an answer with the choice
      // it calls for.
      value={
        field.currencyField
          ? {
              amount: data[field.key],
              currency: data[field.currencyField],
            }
          : field.alternateField
            ? {
                vendorId: data[field.key],
                name: data[field.alternateField],
              }
            : field.dependent
              ? {
                  value: data[field.key],
                  dependent: data[field.dependent.key],
                }
              : data[field.key]
      }
      editable={
        // The 负责人 of an open request is anybody's to
        // hand over, ahead of the record's own rule.
        (Boolean(permissions.update) &&
          domain.handover?.field === field.key &&
          domain.handover.open(data)) ||
        (editable &&
          (field.form !== false ||
            Boolean(domain.fieldEditor?.(field, data))) &&
          !field.readonlyWhen?.(data))
      }
      renderInput={domain.fieldEditor?.(field, data)}
      recordId={id}
      display={
        // `min-w-0` on the items, or a value with no
        // spaces in it — an e-mail, a URL — keeps this
        // box at its own width and spills out of the
        // card: a flex item's `min-width: auto` is its
        // content, and the breaking inside never gets a
        // narrower box to break into.
        <span className='inline-flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 *:min-w-0'>
          {domain.fieldDisplay?.(field, data) ?? (
            <FieldValue
              field={field}
              value={data[field.key]}
              names={names}
              currency={currency}
              plainEnums
              routeFor={(collection) =>
                collection === 'stockItems' && data.relatedAssetType
                  ? (STOCK_ROUTES[data.relatedAssetType as StockKind] ??
                    referenceRoute(collection))
                  : referenceRoute(collection)
              }
            />
          )}
        </span>
      }
      onSave={async (value) => {
        const pair = (value ?? {}) as {
          amount?: unknown;
          currency?: unknown;
          vendorId?: unknown;
          name?: unknown;
          value?: unknown;
          dependent?: unknown;
        };
        const input = field.currencyField
          ? {
              [field.key]: pair.amount ?? null,
              [field.currencyField]: pair.currency ?? null,
            }
          : field.alternateField
            ? {
                [field.key]: pair.vendorId ?? null,
                [field.alternateField]: pair.name || null,
              }
            : field.dependent
              ? {
                  [field.key]: pair.value ?? null,
                  [field.dependent.key]: pair.dependent ?? null,
                }
              : { [field.key]: value };
        try {
          await mutations.update.mutateAsync({ id, input });
        } catch (error) {
          throw new Error(apiErrorBody(error)?.message ?? errorMessage(error), {
            cause: error,
          });
        }
      }}
    />
  );

  return (
    <>
      <DetailPage
        layout={domain.detailLayout ?? 'narrow'}
        breadcrumb={
          hideBreadcrumb ? undefined : BreadcrumbTrail ? (
            <span className='inline-flex flex-wrap items-center gap-1'>
              <Link
                to={`/${domain.route}`}
                className='underline-offset-4 hover:underline'
              >
                {t(`${domain.i18n}.title`)}
              </Link>
              <BreadcrumbTrail record={data} />
            </span>
          ) : (
            <Link
              to={`/${domain.route}`}
              className='underline-offset-4 hover:underline'
            >
              {t(`${domain.i18n}.title`)}
            </Link>
          )
        }
        title={text(data[domain.nameField])}
        titleEdit={{
          value: text(data[domain.nameField]),
          prefix: titlePrefix ? `${titlePrefix} /` : undefined,
          editable:
            editable &&
            domain.fields.find((field) => field.key === domain.nameField)
              ?.form !== false &&
            !domain.fields
              .find((field) => field.key === domain.nameField)
              ?.readonlyWhen?.(data),
          onSave: async (value) => {
            try {
              await mutations.update.mutateAsync({
                id,
                input: { [domain.nameField]: value },
              });
            } catch (error) {
              throw new Error(
                apiErrorBody(error)?.message ?? errorMessage(error),
                { cause: error },
              );
            }
          },
        }}
        notice={Notice ? <Notice record={data} /> : undefined}
        decisions={Decisions ? <Decisions record={data} /> : undefined}
        aside={Aside ? <Aside record={data} /> : undefined}
        subtitle={domain.subtitle?.(data, nameOf, t)}
        actions={
          <>
            {Actions ? <Actions record={data} /> : null}
            {permissions.delete &&
            (domain.deletable?.(data, currentUserId) ?? true) ? (
              domain.deleteInMenu ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant='outline'
                        size='icon'
                        aria-label={t('common.more')}
                      />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end'>
                    <DropdownMenuItem
                      variant='destructive'
                      onClick={() => setDeleting(true)}
                    >
                      <Trash2 />
                      {t('actions.deleteObject', { object: objectLabel })}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button variant='outline' onClick={() => setDeleting(true)}>
                  <Trash2 data-icon='inline-start' />
                  {t('actions.deleteObject', { object: objectLabel })}
                </Button>
              )
            ) : null}
          </>
        }
        summary={[
          ...(domain.summary?.(data, t) ?? []),
          ...(domain.summaryTimestamps === false
            ? []
            : [
                {
                  key: 'createdAt',
                  label: t('fields.createdAt'),
                  value: formatDate(data.createdAt, true),
                },
                {
                  key: 'updatedAt',
                  label: t('fields.updatedAt'),
                  value: formatDate(data.updatedAt, true),
                },
              ]),
        ]}
        info={
          <InfoCard>
            {domain.image ? (
              <RecordImage
                className='mx-auto max-w-56'
                fileId={text(data.imageFileId) || null}
                alt={text(data[domain.nameField])}
                credit={text(data.imageCredit) || null}
                editable={editable}
                onChange={async (file) => {
                  try {
                    await mutations.update.mutateAsync({
                      id,
                      input: file
                        ? { imageFileId: file.id, imageCredit: null }
                        : { imageFileId: null, imageCredit: null },
                    });
                  } catch (error) {
                    throw new Error(
                      apiErrorBody(error)?.message ?? errorMessage(error),
                      { cause: error },
                    );
                  }
                }}
              />
            ) : null}
            {InfoLead ? <InfoLead record={data} /> : null}
            {[...groups.entries()].map(([group, fields], groupIndex) => (
              <Fragment key={group}>
                <InfoSection title={t(group)}>
                  {group === 'groups.basic' && BasicLead ? (
                    <BasicLead record={data} />
                  ) : null}
                  {fields
                    .toSorted(
                      (a, b) => (a.detailOrder ?? 0) - (b.detailOrder ?? 0),
                    )
                    .map((field) => (
                      <InfoRow
                        key={field.key}
                        label={
                          <FieldLabel
                            label={t(field.labelWhen?.(data) ?? field.label)}
                            hint={
                              field.readonlyHint &&
                              ((field.form === false &&
                                !domain.fieldEditor?.(field, data)) ||
                                field.readonlyWhen?.(data))
                                ? field.readonlyHint
                                : undefined
                            }
                          />
                        }
                      >
                        {inlineField(field)}
                      </InfoRow>
                    ))}
                </InfoSection>
                {/* A category's extended fields belong with the basics, the
                  way the device page places them, unless the domain says
                  otherwise. */}
                {(domain.extendedFieldsAfter
                  ? group === domain.extendedFieldsAfter
                  : groupIndex === 0) && domain.extendedFields !== false ? (
                  <ExtendedFields
                    record={data}
                    editable={editable}
                    onSave={async (attributes: Record<string, unknown>) => {
                      await mutations.update.mutateAsync({
                        id,
                        input: { attributes },
                      });
                    }}
                  />
                ) : null}
              </Fragment>
            ))}
          </InfoCard>
        }
        // The record opens on its first tab at its own address (2026-10-23):
        // the route's empty-path child shows it, so no redirect names it.
        landing={domain.defaultTab ?? 'history'}
        // History first on every record, as NocoCRM's 动态 is: what happened
        // and what people said about it (2026-10-14).
        tabs={[
          { key: 'history', label: t('tabs.history'), to: 'history' },
          ...(domain.tabs ?? [])
            .filter((tab) => !tab.visible || tab.visible(data, related.data))
            .map((tab) => ({
              key: tab.key,
              label: t(tab.label),
              to: tab.key,
              count:
                tab.key === 'attachments'
                  ? attachmentCount(attachments.data)
                  : tab.count
                    ? relatedCounts[countedTabs.indexOf(tab)]
                    : tab.countBy
                      ? rowCounts[rowCountedTabs.indexOf(tab)]
                      : tab.countOf
                        ? tab.countOf(tabCountsAnswer.data)
                        : undefined,
            })),
        ]}
      >
        <Outlet />
      </DetailPage>
      <DeleteDialog
        open={deleting}
        onOpenChange={(open) => {
          setDeleting(open);
          if (!open) mutations.remove.reset();
        }}
        objectLabel={objectLabel}
        recordName={text(data[domain.nameField])}
        impact={impact.data}
        loadingImpact={impact.isLoading}
        deleting={mutations.remove.isPending}
        error={
          mutations.remove.error
            ? (apiErrorBody(mutations.remove.error)?.message ??
              errorMessage(mutations.remove.error))
            : undefined
        }
        collectionLabel={(name) =>
          t(`references.${name}`, {
            defaultValue: t(`${masterDataByName(name)?.i18n ?? name}.title`, {
              defaultValue: name,
            }),
          })
        }
        onConfirm={() => {
          void mutations.remove
            .mutateAsync(id)
            .then(() => navigate(`/${domain.route}`));
        }}
      />
    </>
  );
}
