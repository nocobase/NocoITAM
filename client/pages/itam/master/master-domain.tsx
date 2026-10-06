import { MasterCreateDialog } from '@/components/itam/master-create-dialog';
import { masterDataPath, type ItamRecord } from '@/lib/itam/api';
import { isMasterCaptureCollection } from '@/lib/itam/master-capture';
import type {
  DomainConfig,
  DomainListColumn,
  DomainTab,
} from '@/lib/itam/domain';
import { filterableFields, type FieldDefinition } from '@/lib/itam/fields';
import { text } from '@/lib/itam/format';
import {
  masterDataByName,
  type MasterDataCollection,
} from '@/lib/itam/master-data';

import {
  AncestorsTrail,
  CategoryKindCell,
  CategoryKindValue,
  CategoryTemplate,
  OnboardingKitItems,
  MasterActions,
  MasterTree,
  OnHandCell,
  PeopleStats,
  RelatedCountCell,
} from './master-domain-parts.js';
import {
  kindOfAppliesTo,
  statsRequest,
  statsTabCount,
} from './master-stats.js';

/**
 * The master-data collections on the generic domain pages
 * (`DomainListPage` / `DomainDetailPage`), built from their entry in
 * `client/lib/itam/master-data.ts` (migrated 2026-09-28; the pages of their
 * own are gone). What only reference data does lives in
 * `master-domain-parts.tsx` and reaches the pages through the
 * `DomainConfig` slots.
 */

/** The virtual row under a category reference that states its device type. */
const CATEGORY_KIND_KEY = 'categoryAppliesTo';

function buildDomain(collection: MasterDataCollection): DomainConfig {
  const path = masterDataPath(collection.name);
  const hasCategory = collection.fields.some(
    (field) => field.key === 'categoryId',
  );
  const appliesToField = masterDataByName('categories')?.fields.find(
    (field) => field.key === 'appliesTo',
  );
  // A model's or product's device type comes from its category, so it is
  // shown under the category field; it is not the record's own and is never
  // edited here (form: false keeps it out of every dialog).
  const fields: FieldDefinition[] = collection.fields.flatMap((field) =>
    hasCategory && field.key === 'categoryId'
      ? [
          field,
          {
            key: CATEGORY_KIND_KEY,
            label: 'fields.appliesTo',
            type: 'select',
            options: appliesToField?.options,
            form: false,
            readonlyHint: 'categories.appliesToFromCategory',
            group: field.group,
          } satisfies FieldDefinition,
        ]
      : [field],
  );

  // Models filter by their category's device type too (never software);
  // the dropdown follows the columns, after the category.
  const modelKind: FieldDefinition | undefined =
    collection.name === 'models'
      ? {
          key: 'appliesTo',
          label: 'fields.appliesTo',
          type: 'select',
          options: (appliesToField?.options ?? []).filter(
            (option) => option.value !== 'entitlement',
          ),
        }
      : undefined;

  const listColumns: DomainListColumn[] = [
    ...(collection.countColumns ?? []).map((column): DomainListColumn => ({
      key: `count:${column.key}`,
      label: column.label,
      className: 'tabular-nums',
      width: '5rem',
      before: 'updatedAt',
      Cell: ({ row }) => (
        <RelatedCountCell
          collection={collection.name}
          countKey={column.key}
          row={row}
        />
      ),
    })),
    ...(hasCategory
      ? [
          {
            key: 'appliesTo',
            label: 'fields.appliesTo',
            width: '7rem',
            after: 'categoryId',
            Cell: CategoryKindCell,
          } satisfies DomainListColumn,
        ]
      : []),
    ...(collection.countField
      ? [
          {
            key: 'total',
            label: 'fields.quantity',
            className: 'tabular-nums',
            width: '8rem',
            before: 'updatedAt',
            Cell: ({ row }: { readonly row: ItamRecord }) => (
              <OnHandCell countField={collection.countField!} row={row} />
            ),
          } satisfies DomainListColumn,
        ]
      : []),
  ];

  // Tabs conditioned on the category (a model's devices vs. its stock): a
  // category is its own kind, other records follow their category.
  const tabs: DomainTab[] = (collection.extraTabs ?? []).map((tab) => ({
    key: tab.key,
    label: tab.label,
    ...(tab.countless
      ? {}
      : { countOf: (answer: unknown) => statsTabCount(answer, tab.key) }),
    visible: tab.appliesTo
      ? (record, related) => {
          const kind = kindOfAppliesTo(
            collection.name === 'categories'
              ? record.appliesTo
              : related?.appliesTo,
          );
          return kind !== undefined && tab.appliesTo!.includes(kind);
        }
      : undefined,
  }));

  return {
    name: collection.name,
    path,
    route: collection.route,
    i18n: collection.i18n,
    fields,
    nameField: collection.nameField,
    defaultSort: collection.defaultSort,
    titlePrefixField: collection.titlePrefixField,
    // "Manufacturer / Name" sorts by manufacturer then name, the way it reads.
    nameSort:
      collection.titlePrefixField && collection.defaultSort
        ? collection.defaultSort
        : undefined,
    image: collection.image,
    plainCells: true,
    exportColumns: 'readable',
    // A location's owner is a named responsibility, not whoever typed it in.
    ownerFromCreator: false,
    // Reference data has no category template of its own. A model fills
    // its category's fields as the defaults its new devices start with
    // (2026-10-06).
    extendedFields: collection.name === 'models',
    summaryTimestamps: false,
    deleteInMenu: true,
    filterFields: [
      ...filterableFields(collection.fields),
      ...(modelKind ? [modelKind] : []),
    ],
    listColumns,
    fieldDisplay: (field, record) =>
      field.key === CATEGORY_KIND_KEY ? (
        <CategoryKindValue categoryId={record.categoryId} />
      ) : undefined,
    Tree: collection.tree
      ? (props) => <MasterTree collection={collection} {...props} />
      : undefined,
    Stats:
      collection.name === 'people'
        ? ({ onFilter }) => <PeopleStats onFilter={onFilter} />
        : undefined,
    tabs,
    defaultTab: collection.defaultTab,
    relatedRecord:
      hasCategory && collection.name !== 'categories'
        ? {
            path: masterDataPath('categories'),
            id: (record) => text(record.categoryId) || undefined,
          }
        : undefined,
    tabCounts: (id) => statsRequest(collection.name, id),
    BreadcrumbTrail: collection.tree
      ? ({ record }) => (
          <AncestorsTrail collection={collection} record={record} />
        )
      : undefined,
    Actions: ({ record }) => (
      <MasterActions collection={collection} record={record} />
    ),
    // A model or a software product is created with AI 整理 beside the form
    // (2026-10-06): the maker and the model are typed, the rest looked up.
    Create: isMasterCaptureCollection(collection.name)
      ? ((name) =>
          function CreateWithCapture(props) {
            return <MasterCreateDialog collection={name} {...props} />;
          })(collection.name)
      : undefined,
    Aside:
      collection.name === 'categories'
        ? CategoryTemplate
        : collection.name === 'onboardingKits'
          ? OnboardingKitItems
          : undefined,
  };
}

const domains = new Map<string, DomainConfig>();

/**
 * The `DomainConfig` of a master-data collection, built once so the pages
 * see the same object (and the same slot components) on every render.
 */
export function masterDomain(name: string): DomainConfig {
  let domain = domains.get(name);
  if (!domain) {
    const collection = masterDataByName(name);
    if (!collection) throw new Error(`Unknown master-data collection ${name}`);
    domain = buildDomain(collection);
    domains.set(name, domain);
  }
  return domain;
}
