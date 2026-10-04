import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  Factory,
  FolderTree,
  MapPin,
  Package,
  Store,
  Users,
} from 'lucide-react';

import {
  AUDIT_FIELDS,
  type FieldDefinition,
  whenStraightLine,
} from './fields.js';

/**
 * One entry per master-data collection: route, labels, fields, delete rules.
 * The pages are the generic domain pages; `masterDomain()` in
 * `client/pages/itam/master/master-domain.tsx` turns an entry into their
 * `DomainConfig` (the detail layout is the domain pages' narrow one).
 */
export interface MasterDataCollection {
  readonly name: string;
  /** Route path segment and route name. */
  readonly route: string;
  readonly icon: LucideIcon;
  /** Translation key prefix: `${i18n}.title`, `${i18n}.new`, … */
  readonly i18n: string;
  /** Field holding the display name of a record. */
  readonly nameField: string;
  /**
   * A reference field whose name precedes the record name as
   * "Reference / Name" in the detail title and the list's name column.
   */
  readonly titlePrefixField?: string;
  /** Records carry a picture: `imageFileId` (with `imageCredit`). */
  readonly image?: boolean;
  /**
   * The list shows a 合计 column: devices plus stock on hand counted by this
   * field of theirs (e.g. `modelId`).
   */
  readonly countField?:
    'modelId' | 'categoryId' | 'locationId' | 'departmentId';
  /**
   * Count columns from `/itam/master/:collection/counts`: one column per
   * entry, `key` naming the related collection the server counts.
   */
  readonly countColumns?: readonly { key: string; label: string }[];
  readonly fields: readonly FieldDefinition[];
  readonly defaultSort?: string;
  /** Tree collections show a parent selector and a path. */
  readonly tree?: boolean;
  /** Extra detail tabs before History; each is a child route. */
  readonly extraTabs?: readonly {
    readonly key: string;
    readonly label: string;
    /**
     * Shown only when the record's category (or the category itself)
     * applies to one of these: devices (`device`), stock (`stock`:
     * accessories, consumables, components) or entitlements (`entitlement`).
     */
    readonly appliesTo?: readonly ('device' | 'stock' | 'entitlement')[];
    /**
     * No number beside the name. A count belongs on a tab that holds one
     * list; 归属 holds two of different kinds — what the person has and what
     * answers to them — and a single number over both says nothing.
     */
    readonly countless?: boolean;
  }[];
  readonly defaultTab?: string;
}

const notes: FieldDefinition = {
  key: 'notes',
  label: 'fields.notes',
  type: 'textarea',
  group: 'groups.basic',
};

export const VENDOR_TYPES = [
  'equipment',
  'softwareReseller',
  'serviceProvider',
  'repairProvider',
  'lessor',
  'recycler',
  'other',
] as const;
export const CATEGORY_APPLIES_TO = [
  'device',
  'accessory',
  'consumable',
  'component',
  'entitlement',
] as const;
export const LOCATION_TYPES = [
  'company',
  'campus',
  'building',
  'floor',
  'room',
  'rack',
  'warehouse',
  'other',
] as const;

const options = (group: string, values: readonly string[]) =>
  values.map((value) => ({ value, label: `enums.${group}.${value}` }));

export const MASTER_DATA: readonly MasterDataCollection[] = [
  {
    name: 'manufacturers',
    route: 'manufacturers',
    icon: Factory,
    i18n: 'manufacturers',
    nameField: 'name',
    countColumns: [
      { key: 'models', label: 'navigation.models' },
      { key: 'softwareProducts', label: 'navigation.softwareProducts' },
    ],
    extraTabs: [
      { key: 'models', label: 'navigation.models' },
      { key: 'softwareProducts', label: 'navigation.softwareProducts' },
    ],
    defaultTab: 'models',
    fields: [
      {
        key: 'name',
        label: 'fields.name',
        type: 'text',
        required: true,
        column: true,
        group: 'groups.basic',
      },
      {
        key: 'website',
        label: 'fields.website',
        type: 'url',
        column: true,
        group: 'groups.basic',
      },
      {
        key: 'supportPhone',
        label: 'fields.supportPhone',
        type: 'text',
        group: 'groups.basic',
      },
      {
        key: 'supportEmail',
        label: 'fields.supportEmail',
        type: 'text',
        group: 'groups.basic',
      },
      {
        key: 'supportUrl',
        label: 'fields.supportUrl',
        type: 'url',
        group: 'groups.basic',
      },
      notes,
      ...AUDIT_FIELDS,
    ],
  },
  {
    name: 'vendors',
    route: 'vendors',
    icon: Store,
    i18n: 'vendors',
    nameField: 'name',
    countColumns: [
      { key: 'purchaseOrders', label: 'tabs.purchaseOrders' },
      { key: 'repairs', label: 'tabs.repairs' },
    ],
    extraTabs: [
      { key: 'purchaseOrders', label: 'tabs.purchaseOrders' },
      { key: 'repairs', label: 'tabs.repairs' },
    ],
    defaultTab: 'purchaseOrders',
    fields: [
      {
        key: 'name',
        label: 'fields.name',
        type: 'text',
        required: true,
        column: true,
        group: 'groups.basic',
      },
      {
        key: 'types',
        label: 'fields.vendorTypes',
        type: 'multiselect',
        required: true,
        column: true,
        options: options('vendorType', VENDOR_TYPES),
        group: 'groups.basic',
      },
      {
        key: 'contactName',
        label: 'fields.contactName',
        type: 'text',
        column: true,
        group: 'groups.contact',
      },
      {
        key: 'phone',
        label: 'fields.phone',
        type: 'text',
        group: 'groups.contact',
      },
      {
        key: 'email',
        label: 'fields.email',
        type: 'text',
        group: 'groups.contact',
      },
      {
        key: 'address',
        label: 'fields.address',
        type: 'text',
        group: 'groups.contact',
      },
      {
        key: 'website',
        label: 'fields.website',
        type: 'url',
        group: 'groups.contact',
      },
      notes,
      ...AUDIT_FIELDS,
    ],
  },
  {
    name: 'categories',
    route: 'categories',
    icon: FolderTree,
    i18n: 'categories',
    nameField: 'name',
    countColumns: [{ key: 'models', label: 'navigation.models' }],
    tree: true,
    // A software category holds software products, the others models.
    extraTabs: [
      {
        key: 'models',
        label: 'navigation.models',
        appliesTo: ['device', 'stock'],
      },
      {
        key: 'softwareProducts',
        label: 'navigation.softwareProducts',
        appliesTo: ['entitlement'],
      },
      { key: 'children', label: 'tabs.children' },
    ],
    defaultTab: 'models',
    defaultSort: 'sort',
    fields: [
      {
        key: 'name',
        label: 'fields.name',
        type: 'text',
        required: true,
        column: true,
        group: 'groups.basic',
      },
      {
        key: 'parentId',
        label: 'fields.parentCategory',
        type: 'reference',
        reference: { collection: 'categories' },
        column: true,
        group: 'groups.basic',
      },
      {
        key: 'appliesTo',
        label: 'fields.appliesTo',
        type: 'select',
        required: true,
        column: true,
        options: options('appliesTo', CATEGORY_APPLIES_TO),
        // Only a top-level category chooses; a sub-category inherits.
        readonlyWhen: (values) => Boolean(values.parentId),
        readonlyHint: 'categories.appliesToInherited',
        group: 'groups.basic',
      },
      {
        key: 'requiresSerial',
        label: 'fields.requiresSerial',
        type: 'boolean',
        control: 'select',
        required: true,
        defaultValue: true,
        group: 'groups.rules',
      },
      {
        key: 'assignableToPerson',
        label: 'fields.assignableToPerson',
        type: 'boolean',
        control: 'select',
        required: true,
        defaultValue: true,
        group: 'groups.rules',
      },
      {
        key: 'depreciationMethod',
        label: 'fields.depreciationMethod',
        type: 'select',
        required: true,
        defaultValue: 'none',
        options: options('depreciationMethod', ['none', 'straightLine']),
        group: 'groups.defaults',
      },
      {
        key: 'usefulLifeMonths',
        label: 'fields.usefulLifeMonths',
        visibleWhen: whenStraightLine,
        // Three years is the usual life for IT equipment.
        defaultValue: 36,
        type: 'number',
        min: 0,
        group: 'groups.defaults',
      },
      {
        key: 'residualRate',
        label: 'fields.residualRate',
        visibleWhen: whenStraightLine,
        // 5% is the customary salvage rate for IT equipment.
        defaultValue: 0.05,
        type: 'percent',
        group: 'groups.defaults',
      },
      {
        key: 'warrantyMonths',
        label: 'fields.warrantyMonths',
        type: 'number',
        min: 0,
        group: 'groups.defaults',
      },
      {
        key: 'replacementMonths',
        label: 'fields.replacementMonths',
        type: 'number',
        min: 0,
        group: 'groups.defaults',
      },
      {
        key: 'auditCycleDays',
        label: 'fields.auditCycleDays',
        type: 'number',
        min: 0,
        group: 'groups.defaults',
      },
      ...AUDIT_FIELDS,
    ],
  },
  {
    name: 'models',
    route: 'models',
    icon: Package,
    i18n: 'models',
    nameField: 'name',
    titlePrefixField: 'manufacturerId',
    image: true,
    countField: 'modelId',
    defaultSort: 'manufacturerName',
    // A model belongs to one category, so it has either devices or stock
    // items; only the matching tab is shown.
    extraTabs: [
      { key: 'devices', label: 'tabs.devices', appliesTo: ['device'] },
      { key: 'stock', label: 'tabs.stock', appliesTo: ['stock'] },
    ],
    defaultTab: 'devices',
    fields: [
      {
        key: 'name',
        label: 'fields.name',
        type: 'text',
        required: true,
        column: true,
        group: 'groups.basic',
      },
      {
        key: 'code',
        label: 'fields.modelCode',
        type: 'text',
        column: true,
        group: 'groups.basic',
      },
      {
        key: 'manufacturerId',
        label: 'fields.manufacturer',
        type: 'reference',
        required: true,
        reference: { collection: 'manufacturers' },
        column: true,
        group: 'groups.basic',
      },
      {
        key: 'categoryId',
        label: 'fields.category',
        type: 'reference',
        required: true,
        // A model is hardware or stock; software categories hold products.
        reference: {
          collection: 'categories',
          filter: { 'appliesTo:ne': 'entitlement' },
          filterHint: 'categories.hintNotSoftware',
        },
        column: true,
        group: 'groups.basic',
      },
      {
        key: 'specification',
        label: 'fields.specification',
        type: 'textarea',
        group: 'groups.basic',
      },
      {
        key: 'warrantyMonths',
        label: 'fields.warrantyMonths',
        type: 'number',
        min: 0,
        group: 'groups.lifecycle',
      },
      {
        key: 'releaseDate',
        label: 'fields.releaseDate',
        type: 'date',
        group: 'groups.lifecycle',
      },
      {
        key: 'eolDate',
        label: 'fields.eolDate',
        type: 'date',
        group: 'groups.lifecycle',
      },
      {
        key: 'eosDate',
        label: 'fields.eosDate',
        type: 'date',
        group: 'groups.lifecycle',
      },
      ...AUDIT_FIELDS,
    ],
  },
  {
    name: 'softwareProducts',
    route: 'software-products',
    icon: Package,
    i18n: 'softwareProducts',
    nameField: 'name',
    countColumns: [{ key: 'entitlements', label: 'entitlements.object' }],
    extraTabs: [{ key: 'entitlements', label: 'entitlements.object' }],
    defaultTab: 'entitlements',
    fields: [
      {
        key: 'name',
        label: 'fields.name',
        type: 'text',
        required: true,
        column: true,
        group: 'groups.basic',
      },
      {
        key: 'manufacturerId',
        label: 'fields.manufacturer',
        type: 'reference',
        reference: { collection: 'manufacturers' },
        column: true,
        group: 'groups.basic',
      },
      {
        key: 'categoryId',
        label: 'fields.category',
        type: 'reference',
        required: true,
        reference: {
          collection: 'categories',
          filter: { appliesTo: 'entitlement' },
          filterHint: 'categories.hintOnlySoftware',
        },
        column: true,
        group: 'groups.basic',
      },
      {
        key: 'deliveryMethod',
        label: 'fields.deliveryMethod',
        type: 'select',
        required: true,
        column: true,
        options: options('deliveryMethod', ['onPremise', 'saas', 'both']),
        group: 'groups.basic',
      },
      {
        key: 'description',
        label: 'fields.description',
        type: 'textarea',
        group: 'groups.basic',
      },
      {
        key: 'website',
        label: 'fields.website',
        type: 'url',
        group: 'groups.basic',
      },
      notes,
      ...AUDIT_FIELDS,
    ],
  },
  {
    name: 'locations',
    route: 'locations',
    icon: MapPin,
    i18n: 'locations',
    nameField: 'name',
    countColumns: [{ key: 'people', label: 'navigation.people' }],
    tree: true,
    extraTabs: [
      { key: 'devices', label: 'tabs.devices' },
      { key: 'stock', label: 'tabs.stock' },
      { key: 'people', label: 'navigation.people' },
      { key: 'children', label: 'tabs.children' },
    ],
    defaultTab: 'devices',
    defaultSort: 'path',
    fields: [
      {
        key: 'name',
        label: 'fields.name',
        type: 'text',
        required: true,
        column: true,
        group: 'groups.basic',
      },
      {
        key: 'parentId',
        label: 'fields.parentLocation',
        type: 'reference',
        reference: { collection: 'locations' },
        column: true,
        group: 'groups.basic',
      },
      {
        key: 'type',
        label: 'fields.locationType',
        type: 'select',
        required: true,
        column: true,
        options: options('locationType', LOCATION_TYPES),
        group: 'groups.basic',
      },
      {
        key: 'address',
        label: 'fields.address',
        type: 'text',
        column: true,
        group: 'groups.basic',
      },
      {
        key: 'ownerId',
        label: 'fields.owner',
        type: 'reference',
        reference: { collection: 'users' },
        group: 'groups.basic',
      },
      notes,
      ...AUDIT_FIELDS,
    ],
  },
  {
    name: 'departments',
    route: 'departments',
    icon: Building2,
    i18n: 'departments',
    nameField: 'name',
    countColumns: [{ key: 'people', label: 'navigation.people' }],
    tree: true,
    extraTabs: [
      { key: 'devices', label: 'tabs.devices' },
      { key: 'people', label: 'navigation.people' },
      { key: 'children', label: 'tabs.children' },
    ],
    defaultTab: 'devices',
    defaultSort: 'path',
    fields: [
      {
        key: 'name',
        label: 'fields.name',
        type: 'text',
        required: true,
        column: true,
        group: 'groups.basic',
      },
      {
        key: 'parentId',
        label: 'fields.parentDepartment',
        type: 'reference',
        reference: { collection: 'departments' },
        column: true,
        group: 'groups.basic',
      },
      {
        key: 'code',
        label: 'fields.code',
        type: 'text',
        column: true,
        group: 'groups.basic',
      },
      {
        key: 'costCenter',
        label: 'fields.costCenter',
        type: 'text',
        column: true,
        group: 'groups.basic',
      },
      ...AUDIT_FIELDS,
    ],
  },
  {
    name: 'people',
    route: 'people',
    icon: Users,
    i18n: 'people',
    nameField: 'name',
    extraTabs: [{ key: 'holdings', label: 'tabs.holdings', countless: true }],
    defaultTab: 'holdings',
    countColumns: [
      { key: 'devices', label: 'tabs.devices' },
      { key: 'accessories', label: 'people.stockHeld' },
      { key: 'entitlements', label: 'entitlements.object' },
    ],
    fields: [
      {
        key: 'name',
        label: 'fields.personName',
        type: 'text',
        required: true,
        column: true,
        group: 'groups.basic',
      },
      {
        key: 'employeeNo',
        label: 'fields.employeeNo',
        type: 'text',
        column: true,
        group: 'groups.basic',
      },
      {
        // Identity, next to the employee number: which sign-in this person is.
        key: 'userId',
        label: 'fields.linkedUser',
        type: 'reference',
        reference: { collection: 'users' },
        group: 'groups.basic',
      },
      {
        key: 'departmentId',
        label: 'fields.department',
        type: 'reference',
        required: true,
        reference: { collection: 'departments' },
        column: true,
        group: 'groups.basic',
      },
      {
        key: 'position',
        label: 'fields.position',
        type: 'text',
        column: true,
        group: 'groups.basic',
      },
      {
        key: 'email',
        label: 'fields.email',
        type: 'text',
        group: 'groups.contact',
      },
      {
        key: 'phone',
        label: 'fields.phone',
        type: 'text',
        group: 'groups.contact',
      },
      {
        key: 'locationId',
        label: 'fields.officeLocation',
        type: 'reference',
        reference: { collection: 'locations' },
        group: 'groups.contact',
      },
      {
        key: 'employmentStatus',
        label: 'fields.employmentStatus',
        type: 'select',
        column: true,
        options: options('employmentStatus', ['active', 'left']),
        // The leave date decides it; the server refuses it as an input. It
        // stays on the form because it is worth reading, and read-only
        // because two ways to say the same thing disagree sooner or later.
        readonlyWhen: () => true,
        readonlyHint: 'people.followsLeaveDate',
        group: 'groups.employment',
      },
      {
        key: 'hireDate',
        label: 'fields.hireDate',
        type: 'date',
        group: 'groups.employment',
      },
      {
        key: 'leaveDate',
        label: 'fields.leaveDate',
        type: 'date',
        group: 'groups.employment',
      },
      notes,
      ...AUDIT_FIELDS,
    ],
  },
];

export function masterDataByName(
  name: string,
): MasterDataCollection | undefined {
  return MASTER_DATA.find((collection) => collection.name === name);
}
