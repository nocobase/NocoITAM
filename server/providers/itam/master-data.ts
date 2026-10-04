import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import {
  assertInputFields,
  compileAuthzScope,
  outputFields,
  pickFields,
} from './authz-filter.js';
import {
  asText,
  decodeRow,
  listCollection,
  type ListOptions,
  type ListResult,
  type Row,
} from './collection-query.js';
import {
  MASTER_DATA_COLLECTIONS,
  type ItamCollectionDefinition,
} from './collections.js';
import {
  DeleteBlockedError,
  DuplicateValueError,
  RecordNotFoundError,
  ValidationError,
  BusinessRuleError,
  type DeleteImpact,
  type DeleteReference,
} from './errors.js';
import { addMonths, today } from './dates.js';
import { recoveryPlan, type RecoveryItem } from './recovery.js';
import type { HistoryService } from './history.js';

/**
 * Generic CRUD for the master-data collections. Every method takes the
 * authorization conditions the route obtained and applies the record filter
 * in the same statement as its own WHERE, and never returns fields outside
 * the decision's output set.
 */
export type { ListOptions, ListResult, Row } from './collection-query.js';

export interface PersonHoldings {
  readonly devices: readonly Row[];
  readonly stock: readonly Row[];
  readonly entitlementSeats: readonly Row[];
  /** Components installed in those devices, each naming the device it is in. */
  readonly installed?: readonly Row[];
}

/** A record that still names somebody, and so has to change hands. */
export interface OwnedRecord {
  readonly collection: string;
  readonly id: string;
  readonly label: string;
  /** Which field names them: a 负责人 on most, a 申请人 on a request. */
  readonly field: 'ownerId' | 'requesterId';
  /**
   * Which of the five asset types it is, where it is an asset at all: the
   * pages tag those with their own icon, and a repair order or a purchase
   * order is not one of them.
   */
  readonly assetType?: string;
}

/**
 * Every collection whose records name whoever answers for them, and the
 * field that does the naming.
 *
 * 申请人 is that person for a purchase order and a disposal — neither has a
 * 负责人 of its own, and reusing the requester keeps one notion of whose
 * record it is. The label is what the pages call the record: a number where
 * it has one, a name otherwise.
 */
const OWNED_BY_USER: readonly {
  readonly collection: string;
  readonly field: string;
  readonly label: string;
  /** A second column joined to the first — a device reads 编号 / 名称. */
  readonly label2?: string;
  /** The asset type, as a constant or as the column that holds it. */
  readonly assetType?: { readonly value: string } | { readonly column: string };
}[] = [
  {
    collection: 'devices',
    field: 'ownerId',
    label: 'deviceNo',
    label2: 'name',
    assetType: { value: 'device' },
  },
  {
    collection: 'stockItems',
    field: 'ownerId',
    label: 'name',
    // Accessory, consumable or component: the item itself says which.
    assetType: { column: 'kind' },
  },
  {
    collection: 'entitlements',
    field: 'ownerId',
    label: 'name',
    assetType: { value: 'entitlement' },
  },
  { collection: 'repairs', field: 'ownerId', label: 'repairNo' },
  { collection: 'purchaseOrders', field: 'requesterId', label: 'orderNo' },
  { collection: 'disposals', field: 'requesterId', label: 'disposalNo' },
  { collection: 'locations', field: 'ownerId', label: 'name' },
];

/**
 * Whether somebody has left is the leave date and nothing else.
 *
 * It used to be a field of its own, which meant three writers — the form's
 * select, 标记离职, and the nightly job — and any two of them could disagree:
 * a status set back to 在职 with the date still in the past was reversed again
 * that night, and one set to 已离职 with no date gave a person the recovery
 * list without the leaving ever appearing on their timeline.
 *
 * So the date is the only input and the status follows it, derived here on
 * every write and by the nightly job for a date that merely came round. The
 * hire date deliberately takes no part: somebody is active from the moment
 * they exist in the register, because a device is reserved and a kit prepared
 * before the first day, and an assignment refuses a person who has left
 * (`devices.ts`, `entitlements.ts`).
 */
export function employmentFor(
  leaveDate: unknown,
  day: string,
): 'active' | 'left' {
  const date = typeof leaveDate === 'string' ? leaveDate.trim() : '';
  return date !== '' && date <= day ? 'left' : 'active';
}

/** Related collections a list shows counts of, per master-data collection. */
const LIST_COUNTS: Readonly<
  Record<
    string,
    readonly {
      key: string;
      collection: string;
      field: string;
      /** Extra conditions, e.g. only active people; `null` means IS NULL. */
      where?: readonly { field: string; value: string | null }[];
    }[]
  >
> = {
  categories: [
    { key: 'models', collection: 'models', field: 'categoryId' },
    {
      key: 'softwareProducts',
      collection: 'softwareProducts',
      field: 'categoryId',
    },
  ],
  departments: [
    {
      key: 'people',
      collection: 'people',
      field: 'departmentId',
      where: [{ field: 'employmentStatus', value: 'active' }],
    },
  ],
  manufacturers: [
    { key: 'models', collection: 'models', field: 'manufacturerId' },
    {
      key: 'softwareProducts',
      collection: 'softwareProducts',
      field: 'manufacturerId',
    },
  ],
  locations: [{ key: 'people', collection: 'people', field: 'locationId' }],
  vendors: [
    { key: 'purchaseOrders', collection: 'purchaseOrders', field: 'vendorId' },
    { key: 'repairs', collection: 'repairs', field: 'vendorId' },
  ],
  softwareProducts: [
    {
      key: 'entitlements',
      collection: 'entitlements',
      field: 'softwareProductId',
    },
  ],
  // What each person holds, the same three numbers as `personHoldings`.
  people: [
    {
      key: 'devices',
      collection: 'devices',
      field: 'assigneeId',
      where: [{ field: 'assigneeType', value: 'person' }],
    },
    {
      key: 'accessories',
      collection: 'stockHoldings',
      field: 'holderId',
      where: [{ field: 'holderType', value: 'person' }],
    },
    {
      key: 'entitlements',
      collection: 'entitlementSeats',
      field: 'holderId',
      where: [
        { field: 'holderType', value: 'person' },
        { field: 'releasedAt', value: null },
      ],
    },
  ],
};

export interface MasterDataStats {
  /** Simple counts keyed by what they count (models, children, entitlements, …). */
  readonly counts: Readonly<Record<string, number>>;
  /** Non-disposed devices referencing the record, by status. */
  readonly devicesByStatus: Readonly<Record<string, number>>;
  /** Root-first ancestors of a tree node, excluding itself. */
  readonly ancestors: readonly { id: string; name: string }[];
  /** Categories only: devices holding a value per extended-field key. */
  readonly attributeUsage?: Readonly<Record<string, number>>;
}

export interface PeopleStats {
  /** Left the company but still hold a device, stock or a seat. */
  readonly leftHolding: number;
  /** Hire date in the current calendar month. */
  readonly hiredThisMonth: number;
}

export interface MasterDataService {
  definition(collection: string): ItamCollectionDefinition | undefined;
  list(
    collection: string,
    options: ListOptions,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ListResult>;
  get(
    collection: string,
    id: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row | undefined>;
  create(
    collection: string,
    input: Row,
    actorId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  update(
    collection: string,
    id: string,
    input: Row,
    actorId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  deleteImpact(collection: string, id: string): Promise<DeleteImpact>;
  /** Counts shown at the top of a detail page, plus the ancestors of a tree node. */
  stats(collection: string, id: string): Promise<MasterDataStats>;
  /**
   * Related-record counts for every record of a collection, for list
   * columns: `{ entitlements: { [id]: n } }`.
   * Only collections in `LIST_COUNTS` have any.
   */
  listCounts(
    collection: string,
  ): Promise<Record<string, Record<string, number>>>;
  /** The people page's cards. */
  peopleStats(): Promise<PeopleStats>;
  /**
   * Places `id` under `parentId` (null for the root) at `index` among its
   * siblings and renumbers that sibling list; a tree view's drag and drop.
   */
  move(
    collection: string,
    id: string,
    target: { parentId: string | null; index: number },
    actorId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<void>;
  /** Marks a person as having left; returns what they still hold. */
  markPersonLeft(
    id: string,
    actorId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<PersonHoldings>;
  /**
   * Marks everyone still active whose leave date has come (on or before
   * `day`) as left, keeping that date; the daily maintenance calls it.
   * Returns how many were marked.
   */
  /** Reconciles 在职状态 with the leave dates, both ways. */
  markDueLeavers(
    day: string,
  ): Promise<{ readonly left: number; readonly reinstated: number }>;
  /**
   * Everything a person currently holds: devices, stock, entitlement seats.
   * Takes the open connection when it runs inside a transaction — the SQLite
   * pool holds one, so a read through the manager would wait for ever.
   */
  personHoldings(
    id: string,
    connection?: DatabaseConnection,
  ): Promise<PersonHoldings>;
  /**
   * The records that still name this person as the one who answers for them.
   *
   * Holding and answering for are different halves of offboarding and are
   * reached differently: what somebody holds points at their **person**
   * record, what they answer for points at their **sign-in**, which a person
   * record may not have. Somebody with no linked account owns nothing, which
   * is the right answer rather than a missing one.
   *
   * Each collection is read under its own decision, so a caller sees only
   * what they could read in that collection's own list.
   */
  personOwnedRecords(
    id: string,
    allowed: ReadonlyMap<string, DatabaseAuthorizationConditions>,
  ): Promise<readonly OwnedRecord[]>;
  /** Writes down what is in somebody's name as they are marked left. */
  snapshotBelongings(id: string, connection?: DatabaseConnection): Promise<void>;
  /** What that snapshot holds, or undefined where none was taken. */
  belongingsSnapshot(id: string): Promise<readonly RecoveryItem[] | undefined>;
  delete(
    collection: string,
    id: string,
    actorId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<void>;
}

export const masterDataServiceToken: ServiceToken<MasterDataService> =
  createServiceToken<MasterDataService>('itam/master-data-service');

/**
 * Which records point at a master-data record, per collection; any hit
 * blocks deletion. A person is only blocked by what is still open (an
 * unreleased seat, a holding, a device assigned to them)
 * and allocation history that name them — a leaver is marked as left, not
 * deleted. Purchase orders and disposals name their requester by user or
 * person id, so they cannot be matched and do not block.
 */
const REFERENCES: Readonly<
  Record<
    string,
    readonly {
      collection: string;
      field: string;
      /** Extra conditions; `null` means IS NULL. */
      where?: readonly { field: string; value: string | null }[];
    }[]
  >
> = {
  manufacturers: [
    { collection: 'models', field: 'manufacturerId' },
    { collection: 'softwareProducts', field: 'manufacturerId' },
    { collection: 'entitlements', field: 'manufacturerId' },
    { collection: 'devices', field: 'manufacturerId' },
    { collection: 'stockItems', field: 'manufacturerId' },
  ],
  vendors: [
    { collection: 'devices', field: 'vendorId' },
    { collection: 'devices', field: 'lenderVendorId' },
    { collection: 'purchaseOrders', field: 'vendorId' },
    { collection: 'repairs', field: 'vendorId' },
  ],
  categories: [
    { collection: 'categories', field: 'parentId' },
    { collection: 'models', field: 'categoryId' },
    { collection: 'softwareProducts', field: 'categoryId' },
    { collection: 'entitlements', field: 'categoryId' },
    { collection: 'devices', field: 'categoryId' },
    { collection: 'stockItems', field: 'categoryId' },
  ],
  models: [
    { collection: 'devices', field: 'modelId' },
    { collection: 'stockItems', field: 'modelId' },
    { collection: 'purchaseOrderLines', field: 'modelId' },
  ],
  softwareProducts: [
    { collection: 'entitlements', field: 'softwareProductId' },
    { collection: 'purchaseOrderLines', field: 'softwareProductId' },
  ],
  locations: [
    { collection: 'locations', field: 'parentId' },
    { collection: 'devices', field: 'locationId' },
    { collection: 'people', field: 'locationId' },
    { collection: 'stockItems', field: 'locationId' },
  ],
  departments: [
    { collection: 'departments', field: 'parentId' },
    { collection: 'people', field: 'departmentId' },
    { collection: 'devices', field: 'departmentId' },
    { collection: 'purchaseOrders', field: 'departmentId' },
  ],
  people: [
    {
      collection: 'devices',
      field: 'assigneeId',
      where: [{ field: 'assigneeType', value: 'person' }],
    },
    {
      collection: 'stockHoldings',
      field: 'holderId',
      where: [{ field: 'holderType', value: 'person' }],
    },
    {
      collection: 'entitlementSeats',
      field: 'holderId',
      where: [
        { field: 'holderType', value: 'person' },
        { field: 'releasedAt', value: null },
      ],
    },
    {
      collection: 'allocations',
      field: 'targetId',
      where: [{ field: 'targetType', value: 'person' }],
    },
  ],
};

const UNIQUE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  departments: ['code'],
  manufacturers: ['name'],
  vendors: ['name'],
  softwareProducts: ['name'],
  people: ['employeeNo', 'userId'],
};

/**
 * Names unique within a scope: a model per manufacturer, a tree node among
 * its siblings (the same name may recur under different parents).
 */
const UNIQUE_SCOPES: Readonly<
  Record<string, readonly { readonly field: string; readonly within: string }[]>
> = {
  models: [{ field: 'name', within: 'manufacturerId' }],
  categories: [{ field: 'name', within: 'parentId' }],
  locations: [{ field: 'name', within: 'parentId' }],
  departments: [{ field: 'name', within: 'parentId' }],
};

const TREE_COLLECTIONS = new Set(['locations', 'departments', 'categories']);
const PATH_COLLECTIONS = new Set(['locations', 'departments']);
const JSON_FIELDS: Readonly<Record<string, readonly string[]>> = {
  vendors: ['types'],
  categories: ['fieldTemplate'],
};

export function createMasterDataService(
  database: DatabaseManager,
  history: HistoryService,
): MasterDataService {
  const definitions = new Map(
    MASTER_DATA_COLLECTIONS.map((definition) => [definition.name, definition]),
  );

  const require = (collection: string): ItamCollectionDefinition => {
    const definition = definitions.get(collection);
    if (!definition) throw new RecordNotFoundError(collection, '*');
    return definition;
  };

  const decode = (collection: string, row: Row): Row => {
    const jsonFields = JSON_FIELDS[collection] ?? [];
    if (jsonFields.length === 0) return row;
    const decoded: Record<string, unknown> = { ...row };
    for (const field of jsonFields) {
      const value = decoded[field];
      if (typeof value === 'string') {
        try {
          decoded[field] = JSON.parse(value);
        } catch {
          // keep the raw string
        }
      }
    }
    return decoded;
  };

  const findRaw = async (
    collection: string,
    id: string,
    connection?: DatabaseConnection,
  ): Promise<Row | undefined> => {
    const row = await (connection ? connection.query : database.query())
      .selectFrom(collection)
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? decode(collection, row) : undefined;
  };

  /** Straight-line depreciation needs a useful life to compute anything. */
  const assertDepreciation = (
    collection: string,
    merged: Readonly<Record<string, unknown>>,
  ) => {
    if (collection !== 'categories') return;
    if (merged.depreciationMethod !== 'straightLine') return;
    const life = Number(merged.usefulLifeMonths);
    if (!Number.isFinite(life) || life <= 0) {
      throw new ValidationError(
        'usefulLifeMonths is required for straight-line depreciation',
        'usefulLifeMonths',
      );
    }
  };

  const assertUnique = async (
    collection: string,
    input: Row,
    excludeId?: string,
    /** The stored record on update, so a scope field left out still counts. */
    previous?: Row,
  ) => {
    for (const field of UNIQUE_FIELDS[collection] ?? []) {
      const value = input[field];
      if (value === undefined || value === null || value === '') continue;
      let query = database
        .query()
        .selectFrom(collection)
        .select('id')
        .where(field, '=', value as never);
      if (excludeId) query = query.where('id', '!=', excludeId);
      if (await query.executeTakeFirst()) {
        throw new DuplicateValueError(field, value);
      }
    }
    const merged = { ...previous, ...input };
    for (const scope of UNIQUE_SCOPES[collection] ?? []) {
      if (!(scope.field in input) && !(scope.within in input)) continue;
      const value = merged[scope.field];
      if (value === undefined || value === null || value === '') continue;
      const within = merged[scope.within];
      let query = database
        .query()
        .selectFrom(collection)
        .select('id')
        .where(scope.field, '=', value as never);
      query =
        within === undefined || within === null || within === ''
          ? query.where(scope.within, 'is', null)
          : query.where(scope.within, '=', within as never);
      if (excludeId) query = query.where('id', '!=', excludeId);
      if (await query.executeTakeFirst()) {
        throw new DuplicateValueError(scope.field, value);
      }
    }
  };

  /** Every descendant id of a tree node, walked by parent (trees without a path). */
  const descendantIds = async (
    collection: string,
    id: string,
  ): Promise<string[]> => {
    const found: string[] = [];
    let frontier = [id];
    while (frontier.length > 0) {
      const children = await database
        .query()
        .selectFrom(collection)
        .select('id')
        .where('parentId', 'in', frontier)
        .execute<{ id: string }>();
      frontier = children.map((row) => row.id);
      found.push(...frontier);
    }
    return found;
  };

  /** A model belongs to a hardware or stock category, never a software one. */
  const assertModelCategory = async (collection: string, input: Row) => {
    if (collection !== 'models' || typeof input.categoryId !== 'string') return;
    const category = await findRaw('categories', input.categoryId);
    if (category?.appliesTo === 'entitlement') {
      throw new BusinessRuleError(
        'A model cannot belong to a software category',
        'MODEL_CATEGORY_KIND',
      );
    }
  };

  const assertParent = async (
    collection: string,
    id: string | undefined,
    parentId: unknown,
  ): Promise<Row | undefined> => {
    if (!TREE_COLLECTIONS.has(collection) || !parentId) return undefined;
    if (typeof parentId !== 'string') {
      throw new ValidationError('parentId must be a string', 'parentId');
    }
    if (id && parentId === id) {
      throw new ValidationError(
        'A record cannot be its own parent',
        'parentId',
      );
    }
    const parent = await findRaw(collection, parentId);
    if (!parent) throw new ValidationError('Parent not found', 'parentId');
    if (id && PATH_COLLECTIONS.has(collection)) {
      const parentPath = typeof parent.path === 'string' ? parent.path : '';
      if (parentPath.includes(`/${id}/`)) {
        throw new ValidationError(
          'A record cannot be moved under its own descendant',
          'parentId',
        );
      }
    } else if (id) {
      // Trees without a materialized path walk up from the new parent.
      let ancestor: Row | undefined = parent;
      const seen = new Set<string>();
      while (ancestor && typeof ancestor.parentId === 'string') {
        if (ancestor.parentId === id) {
          throw new ValidationError(
            'A record cannot be moved under its own descendant',
            'parentId',
          );
        }
        if (seen.has(ancestor.parentId)) break;
        seen.add(ancestor.parentId);
        ancestor = await findRaw(collection, ancestor.parentId);
      }
    }
    return parent;
  };

  const pathFor = (parent: Row | undefined, id: string): string =>
    `${parent ? String(parent.path) : '/'}${id}/`;

  return {
    definition: (collection) => definitions.get(collection),

    async list(collection, options, conditions) {
      let effective = options;
      // Models filter by the device type of their category: resolve the
      // categories of that type and filter by them.
      const { appliesTo, ...rest } = options.filter ?? {};
      if (collection === 'models' && typeof appliesTo === 'string') {
        const categories = await database
          .query()
          .selectFrom('categories')
          .select('id')
          .where('appliesTo', '=', appliesTo)
          .execute<{ id: string }>();
        effective = {
          ...options,
          filter: {
            ...rest,
            // The impossible id keeps the IN list non-empty, so a type
            // with no categories yields no rows rather than every row.
            categoryId: rest.categoryId ?? [
              ...categories.map((row) => row.id),
              '\u0000',
            ],
          },
        };
      }
      return listCollection(
        database,
        require(collection),
        effective,
        conditions,
        {
          jsonFields: JSON_FIELDS[collection],
        },
      );
    },

    async get(collection, id, conditions) {
      const definition = require(collection);
      const row = await database
        .query()
        .selectFrom(collection)
        .selectAll()
        .where('id', '=', id)
        .where((eb) => compileAuthzScope(eb, conditions.scope))
        .executeTakeFirst();
      if (!row) return undefined;
      return pickFields(
        decode(collection, row as Row),
        outputFields(definition.fields, conditions),
      );
    },

    async create(collection, input, actorId, conditions) {
      const definition = require(collection);
      assertInputFields(input, conditions.fieldAccess?.input ?? '*');
      await assertUnique(collection, input);
      assertDepreciation(collection, input);
      const parent = await assertParent(collection, undefined, input.parentId);
      // A sub-category inherits what its parent applies to; only roots choose.
      if (collection === 'categories' && parent)
        input = { ...input, appliesTo: parent.appliesTo };
      await assertModelCategory(collection, input);
      // 在职状态 follows the leave date on a create as well as an update: a
      // person entered with a date already passed — a leaver recorded after
      // the fact, or an import — was stored `active` and stayed so until the
      // nightly job came round, which is long enough for the register to say
      // somebody still works here when the file said otherwise.
      if (collection === 'people' && 'employmentStatus' in input) {
        throw new ValidationError(
          'Employment status follows the leave date and cannot be set directly',
          'employmentStatus',
        );
      }
      const id = crypto.randomUUID();
      const now = new Date();
      const values: Record<string, unknown> = {
        ...input,
        ...(collection === 'people'
          ? { employmentStatus: employmentFor(input.leaveDate, today()) }
          : {}),
        id,
        createdAt: now,
        updatedAt: now,
      };
      if (definition.fields.includes('createdById'))
        values.createdById = actorId;
      if (PATH_COLLECTIONS.has(collection)) values.path = pathFor(parent, id);

      await database.transaction(async (connection) => {
        await connection.query.insertInto(collection).values(values).execute();
        await history.log(
          { subjectType: collection, subjectId: id, action: 'create', actorId },
          connection,
        );
      });
      const created = await findRaw(collection, id);
      return pickFields(
        created ?? {},
        outputFields(definition.fields, conditions),
      );
    },

    async update(collection, id, input, actorId, conditions) {
      const definition = require(collection);
      assertInputFields(input, conditions.fieldAccess?.input ?? '*');
      const before = await database
        .query()
        .selectFrom(collection)
        .selectAll()
        .where('id', '=', id)
        .where((eb) => compileAuthzScope(eb, conditions.scope))
        .executeTakeFirst();
      if (!before) throw new RecordNotFoundError(collection, id);
      const previous = decode(collection, before);
      await assertUnique(collection, input, id, previous);
      // Switching to straight-line is allowed with the life still empty (the
      // field appears once the method is set); clearing the life is not.
      if ('usefulLifeMonths' in input)
        assertDepreciation(collection, { ...previous, ...input });
      // A top-level category's type change flows down its subtree; the
      // whole subtree must be free of records first.
      let retypedDescendants: string[] = [];
      if (
        collection === 'categories' &&
        'appliesTo' in input &&
        input.appliesTo !== previous.appliesTo
      ) {
        // What a category applies to decides which records may use it, so
        // it is fixed once anything does; move those records first.
        retypedDescendants = await descendantIds(collection, id);
        for (const nodeId of [id, ...retypedDescendants]) {
          const inUse = await this.deleteImpact(collection, nodeId);
          const holders = inUse.references.filter(
            (reference) => reference.collection !== 'categories',
          );
          if (holders.length > 0) {
            throw new BusinessRuleError(
              'The category is in use; move its models, devices, stock items or software products before changing what it applies to',
              'CATEGORY_IN_USE',
            );
          }
        }
      }
      await assertModelCategory(collection, input);
      const parentChanged =
        'parentId' in input && input.parentId !== previous.parentId;
      const parent = parentChanged
        ? await assertParent(collection, id, input.parentId)
        : undefined;
      if (collection === 'categories') {
        // A sub-category shares its parent's device type: moving under a
        // parent of another type is refused, and the type itself cannot be
        // edited on a sub-category.
        const parentId = parentChanged
          ? input.parentId
          : (previous.parentId ?? null);
        const effectiveParent =
          parent ??
          (typeof parentId === 'string' && parentId
            ? await findRaw(collection, parentId)
            : undefined);
        const appliesTo =
          'appliesTo' in input ? input.appliesTo : previous.appliesTo;
        if (effectiveParent && appliesTo !== effectiveParent.appliesTo) {
          throw new BusinessRuleError(
            'A sub-category applies to the same device type as its parent',
            'CATEGORY_TYPE_MISMATCH',
          );
        }
      }

      // 在职状态 follows the leave date; see `employmentFor`. An attempt to
      // set it directly is refused rather than ignored, so a caller is told
      // the field is not theirs instead of watching the value not stick.
      if (collection === 'people' && 'employmentStatus' in input) {
        throw new ValidationError(
          'Employment status follows the leave date and cannot be set directly',
          'employmentStatus',
        );
      }
      const values: Record<string, unknown> = {
        ...input,
        ...(collection === 'people' && 'leaveDate' in input
          ? {
              employmentStatus: employmentFor(input.leaveDate, today()),
            }
          : {}),
        updatedAt: new Date(),
      };
      delete values.id;
      delete values.createdAt;
      delete values.createdById;

      await database.transaction(async (connection) => {
        if (parentChanged && PATH_COLLECTIONS.has(collection)) {
          const oldPath = String(previous.path);
          const newPath = pathFor(parent, id);
          values.path = newPath;
          // Re-root every descendant path under the new ancestry.
          const descendants = await connection.query
            .selectFrom(collection)
            .select(['id', 'path'])
            .where('path', 'like', `${oldPath}%`)
            .where('id', '!=', id)
            .execute();
          for (const descendant of descendants) {
            await connection.query
              .updateTable(collection)
              .set({
                path: `${newPath}${String(descendant.path).slice(oldPath.length)}`,
              })
              .where('id', '=', descendant.id)
              .execute();
          }
        }
        await connection.query
          .updateTable(collection)
          .set(values)
          .where('id', '=', id)
          .where((eb) => compileAuthzScope(eb, conditions.scope))
          .execute();
        if (retypedDescendants.length > 0) {
          await connection.query
            .updateTable(collection)
            .set({ appliesTo: input.appliesTo, updatedAt: new Date() })
            .where('id', 'in', retypedDescendants)
            .execute();
        }
        await history.logChanges(
          { subjectType: collection, subjectId: id },
          previous,
          input,
          { actorId },
          connection,
        );
        // The planned replacement date is the category's rule applied to
        // the purchase date, so a changed cycle moves every device filed
        // under the category.
        if (
          collection === 'categories' &&
          'replacementMonths' in input &&
          input.replacementMonths !== previous.replacementMonths
        ) {
          const months = Number(input.replacementMonths ?? 0);
          const devices = await connection.query
            .selectFrom('devices')
            .select(['id', 'purchaseDate'])
            .where('categoryId', '=', id)
            .execute<{ id: string; purchaseDate: string | null }>();
          for (const device of devices)
            await connection.query
              .updateTable('devices')
              .set({
                plannedReplacementDate:
                  device.purchaseDate && months > 0
                    ? addMonths(device.purchaseDate, months)
                    : null,
              })
              .where('id', '=', device.id)
              .execute();
        }
        // A leave date entered or moved into the past settles it here, so
        // this is the moment of leaving as much as the button is.
        if (
          collection === 'people' &&
          values.employmentStatus === 'left' &&
          previous.employmentStatus !== 'left'
        )
          await this.snapshotBelongings(id, connection);
      });
      const updated = await findRaw(collection, id);
      return pickFields(
        updated ?? {},
        outputFields(definition.fields, conditions),
      );
    },

    /**
     * Records what is in somebody's name the moment they are marked as
     * having left.
     *
     * The list on their page is live — a device returned leaves it, because
     * it is in stock now and the page would otherwise be saying somebody
     * holds what they do not. So "how much of this is done" has no
     * denominator unless the moment of leaving is written down, which is
     * what this is: the one fact that cannot be recomputed later, because by
     * then the things have moved.
     *
     * Every path that marks somebody left takes it — the button, a leave
     * date entered or moved into the past, and the nightly job for a date
     * that merely came round — so it exists whenever it could be needed.
     * Each of those fires only on the move into `left`, so one leaving
     * writes one snapshot; somebody reinstated and then leaving again gets
     * a second, and the progress is read against the newest. The older ones
     * stay where every other event stays, on the timeline.
     */
    async snapshotBelongings(id, connection) {
      const items = recoveryPlan(
        await this.personHoldings(id, connection),
      ).filter(
        (item) => item.handling !== 'none',
      );
      if (items.length === 0) return;
      await history.record(
        {
          subjectType: 'people',
          subjectId: id,
          type: 'belongingsSnapshot',
          summary: `In their name when they left: ${items.length}`,
          payload: { items },
        },
        connection,
      );
    },

    async belongingsSnapshot(id) {
      const row = await database
        .query()
        .selectFrom('historyEvents')
        .select('payload')
        .where('subjectType', '=', 'people')
        .where('subjectId', '=', id)
        .where('type', '=', 'belongingsSnapshot')
        // The newest: a person may have left, come back and left again.
        .orderBy('createdAt', 'desc')
        .executeTakeFirst<Row>();
      if (!row) return undefined;
      const payload = decodeRow(row).payload as
        | { items?: readonly RecoveryItem[] }
        | undefined;
      return payload?.items ?? [];
    },

    async personOwnedRecords(id, allowed) {
      const person = await database
        .query()
        .selectFrom('people')
        .select('userId')
        .where('id', '=', id)
        .executeTakeFirst<Row>();
      const userId = asText(person?.userId);
      // Nobody signs in as them, so no record can name them.
      if (!userId) return [];
      const found: OwnedRecord[] = [];
      for (const entry of OWNED_BY_USER) {
        const conditions = allowed.get(entry.collection);
        if (!conditions) continue;
        const column =
          entry.assetType && 'column' in entry.assetType
            ? entry.assetType.column
            : undefined;
        const columns = ['id', entry.label];
        if (entry.label2) columns.push(entry.label2);
        if (column) columns.push(column);
        const rows = await database
          .query()
          .selectFrom(entry.collection)
          .select(columns)
          .where(entry.field, '=', userId)
          .where((eb) => compileAuthzScope(eb, conditions.scope))
          .orderBy(entry.label, 'asc')
          .execute<Row>();
        for (const row of rows) {
          found.push({
            collection: entry.collection,
            id: String(row.id),
            label: [
              asText(row[entry.label]) ?? String(row.id),
              entry.label2 ? asText(row[entry.label2]) : undefined,
            ]
              .filter(Boolean)
              .join(' / '),
            field: entry.field as OwnedRecord['field'],
            ...(entry.assetType
              ? {
                  assetType:
                    'value' in entry.assetType
                      ? entry.assetType.value
                      : (asText(row[entry.assetType.column]) ?? undefined),
                }
              : {}),
          });
        }
      }
      return found;
    },

    async personHoldings(id, connection) {
      const read = connection ? connection.query : database.query();
      const devices = await read
        .selectFrom('devices')
        .select([
          'id',
          'deviceNo',
          'name',
          'status',
          'assignedAt',
          'modelId',
          'categoryId',
          // Who answers for it: the leaver's recovery is handed to them.
          'ownerId',
        ])
        .where('assigneeType', '=', 'person')
        .where('assigneeId', '=', id)
        .orderBy('deviceNo', 'asc')
        .execute<Row>();
      const stock = await read
        .selectFrom('stockHoldings')
        .innerJoin('stockItems', 'stockItems.id', 'stockHoldings.stockItemId')
        .select([
          'stockHoldings.id as id',
          'stockHoldings.stockItemId as stockItemId',
          'stockHoldings.quantity as quantity',
          'stockHoldings.updatedAt as updatedAt',
          'stockItems.name as name',
          'stockItems.kind as kind',
          'stockItems.ownerId as ownerId',
        ])
        .where('stockHoldings.holderType', '=', 'person')
        .where('stockHoldings.holderId', '=', id)
        .execute<Row>();
      const entitlementSeats = await read
        .selectFrom('entitlementSeats')
        .innerJoin(
          'entitlements',
          'entitlements.id',
          'entitlementSeats.entitlementId',
        )
        .select([
          'entitlementSeats.id as id',
          'entitlementSeats.entitlementId as entitlementId',
          'entitlementSeats.account as account',
          'entitlementSeats.assignedAt as assignedAt',
          'entitlements.kind as kind',
          'entitlements.name as name',
          'entitlements.ownerId as ownerId',
        ])
        .where('entitlementSeats.holderType', '=', 'person')
        .where('entitlementSeats.holderId', '=', id)
        .where('entitlementSeats.releasedAt', 'is', null)
        .execute<Row>();
      // What is installed in those devices. A component belongs to the
      // device and goes back inside it, so it is never a line of its own to
      // settle — but handing the laptop back hands these back with it, and
      // somebody checking what they are taking has to see them.
      const deviceIds = devices.map((row) => String(row.id));
      const installed =
        deviceIds.length === 0
          ? []
          : await read
              .selectFrom('stockHoldings')
              .innerJoin(
                'stockItems',
                'stockItems.id',
                'stockHoldings.stockItemId',
              )
              .select([
                'stockHoldings.id as id',
                'stockHoldings.holderId as deviceId',
                'stockHoldings.stockItemId as stockItemId',
                'stockHoldings.quantity as quantity',
                'stockItems.name as name',
              ])
              .where('stockHoldings.holderType', '=', 'device')
              .where('stockHoldings.holderId', 'in', deviceIds)
              .execute<Row>();
      const decode = (rows: readonly Row[]) =>
        rows.map((row) => decodeRow(row));
      return {
        devices: decode(devices),
        stock: decode(stock),
        entitlementSeats: decode(entitlementSeats),
        installed: decode(installed),
      };
    },

    async markPersonLeft(id, actorId, conditions) {
      const person = await database
        .query()
        .selectFrom('people')
        .selectAll()
        .where('id', '=', id)
        .where((eb) => compileAuthzScope(eb, conditions.scope))
        .executeTakeFirst<Row>();
      if (!person) throw new RecordNotFoundError('people', id);
      if (person.employmentStatus === 'left') {
        throw new ValidationError(
          'Person has already left',
          'employmentStatus',
        );
      }
      const leaveDate = today();
      await database.transaction(async (connection) => {
        await connection.query
          .updateTable('people')
          .set({ employmentStatus: 'left', leaveDate, updatedAt: new Date() })
          .where('id', '=', id)
          .execute();
        await history.logChanges(
          { subjectType: 'people', subjectId: id },
          person,
          { employmentStatus: 'left', leaveDate },
          { actorId },
          connection,
        );
        await history.record(
          {
            subjectType: 'people',
            subjectId: id,
            type: 'left',
            summary: 'Marked as left',
            actorId,
          },
          connection,
        );
        await this.snapshotBelongings(id, connection);
      });
      return this.personHoldings(id);
    },

    async markDueLeavers(day) {
      const due = await database
        .query()
        .selectFrom('people')
        .selectAll()
        .where('employmentStatus', '=', 'active')
        .where('leaveDate', 'is not', null)
        .where('leaveDate', '<=', day)
        .execute<Row>();
      for (const person of due) {
        const id = String(person.id);
        await database.transaction(async (connection) => {
          await connection.query
            .updateTable('people')
            .set({ employmentStatus: 'left', updatedAt: new Date() })
            .where('id', '=', id)
            .execute();
          // The same record 标记离职 leaves, told apart by `automatic`: the
          // date was entered beforehand and the scheduler acted on it.
          await history.logChanges(
            { subjectType: 'people', subjectId: id },
            person,
            { employmentStatus: 'left' },
            { sourceType: 'scheduler' },
            connection,
          );
          await history.record(
            {
              subjectType: 'people',
              subjectId: id,
              type: 'left',
              summary: `Marked as left on the leave date ${String(person.leaveDate)}`,
              payload: { automatic: true, leaveDate: person.leaveDate },
              sourceType: 'scheduler',
            },
            connection,
          );
          await this.snapshotBelongings(id, connection);
        });
      }
      // The other direction, which was missing: a leave date cleared or moved
      // out again leaves somebody marked as left for ever, and extending a
      // notice period is not rare. The status is the date's, so the job
      // reconciles both ways.
      const back = await database
        .query()
        .selectFrom('people')
        .selectAll()
        .where('employmentStatus', '=', 'left')
        .execute<Row>();
      const reinstated = back.filter(
        (person) => employmentFor(person.leaveDate, day) === 'active',
      );
      for (const person of reinstated) {
        const id = String(person.id);
        await database.transaction(async (connection) => {
          await connection.query
            .updateTable('people')
            .set({ employmentStatus: 'active', updatedAt: new Date() })
            .where('id', '=', id)
            .execute();
          await history.logChanges(
            { subjectType: 'people', subjectId: id },
            person,
            { employmentStatus: 'active' },
            { sourceType: 'scheduler', origin: 'schedule' },
            connection,
          );
        });
      }
      return { left: due.length, reinstated: reinstated.length };
    },

    async move(collection, id, target, actorId, conditions) {
      require(collection);
      if (!TREE_COLLECTIONS.has(collection))
        throw new ValidationError('Not a tree collection');
      const record = await database
        .query()
        .selectFrom(collection)
        .selectAll()
        .where('id', '=', id)
        .where((eb) => compileAuthzScope(eb, conditions.scope))
        .executeTakeFirst<Row>();
      if (!record) throw new RecordNotFoundError(collection, id);
      const parentId = target.parentId ?? null;
      if (parentId !== (record.parentId ?? null)) {
        // Re-parenting goes through update so paths and history stay right.
        await this.update(collection, id, { parentId }, actorId, conditions);
      }
      const siblings = await database
        .query()
        .selectFrom(collection)
        .select(['id', 'sort'])
        .where((eb) =>
          parentId === null
            ? eb('parentId', 'is', null)
            : eb('parentId', '=', parentId),
        )
        .orderBy('sort', 'asc')
        .orderBy('name', 'asc')
        .execute<{ id: string; sort: number | null }>();
      const others = siblings.filter((row) => row.id !== id);
      const index = Math.max(0, Math.min(target.index, others.length));
      const ordered = [
        ...others.slice(0, index),
        { id, sort: null },
        ...others.slice(index),
      ];
      await database.transaction(async (connection) => {
        for (const [position, row] of ordered.entries()) {
          const sort = (position + 1) * 10;
          if (row.sort === sort) continue;
          await connection.query
            .updateTable(collection)
            .set({ sort, updatedAt: new Date() })
            .where('id', '=', row.id)
            .execute();
          await history.logChanges(
            { subjectType: collection, subjectId: row.id },
            { sort: row.sort },
            { sort },
            { actorId },
            connection,
          );
        }
      });
    },

    async peopleStats() {
      const query = database.query();
      const holders = new Set<string>();
      const collect = async (
        table: string,
        idField: string,
        refine: (q: ReturnType<typeof query.selectFrom>) => typeof q,
      ) => {
        const rows = await refine(
          query.selectFrom(table).select(`${idField} as holder`),
        ).execute<{ holder: string | null }>();
        for (const row of rows) if (row.holder) holders.add(row.holder);
      };
      await collect('devices', 'assigneeId', (q) =>
        q.where('assigneeType', '=', 'person'),
      );
      await collect('stockHoldings', 'holderId', (q) =>
        q.where('holderType', '=', 'person').where('quantity', '>', 0),
      );
      await collect('entitlementSeats', 'holderId', (q) =>
        q.where('holderType', '=', 'person').where('releasedAt', 'is', null),
      );
      const leftRows = await query
        .selectFrom('people')
        .select('id')
        .where('employmentStatus', '=', 'left')
        .execute<{ id: string }>();
      const leftHolding = leftRows.filter((row) => holders.has(row.id)).length;

      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const hired = await query
        .selectFrom('people')
        .select((eb) => [eb.fn.countAll().as('total')])
        .where('hireDate', '>=', monthStart)
        .executeTakeFirst<{ total: unknown }>();
      return {
        leftHolding,
        hiredThisMonth: Number(hired?.total ?? 0),
      };
    },

    async listCounts(collection) {
      require(collection);
      const result: Record<string, Record<string, number>> = {};
      for (const related of LIST_COUNTS[collection] ?? []) {
        let query = database
          .query()
          .selectFrom(related.collection)
          .select((eb) => [related.field, eb.fn.countAll().as('total')])
          .groupBy(related.field);
        for (const condition of related.where ?? [])
          query =
            condition.value === null
              ? query.where(condition.field, 'is', null)
              : query.where(condition.field, '=', condition.value);
        const rows = await query.execute<Record<string, unknown>>();
        result[related.key] = Object.fromEntries(
          rows
            .filter((row) => row[related.field] != null)
            .map((row) => [String(row[related.field]), Number(row.total)]),
        );
      }
      // A category's entitlements (the category follows the software product).
      if (collection === 'categories') {
        const rows = await database
          .query()
          .selectFrom('entitlements')
          .select((eb) => ['categoryId', eb.fn.countAll().as('total')])
          .where('categoryId', 'is not', null)
          .groupBy('categoryId')
          .execute<{ categoryId: string; total: unknown }>();
        result.entitlements = Object.fromEntries(
          rows.map((row) => [row.categoryId, Number(row.total)]),
        );
      }
      return result;
    },

    async stats(collection, id) {
      require(collection);
      const count = async (
        table: string,
        field: string,
        extra?: {
          field: string;
          op: 'in' | 'not in' | '=';
          value: string | string[];
        },
      ) => {
        let query = database
          .query()
          .selectFrom(table)
          .select((eb) => [eb.fn.countAll().as('total')])
          .where(field, '=', id);
        if (extra) query = query.where(extra.field, extra.op, extra.value);
        const row = await query.executeTakeFirst<{ total: unknown }>();
        return Number(row?.total ?? 0);
      };
      const counts: Record<string, number> = {};
      // Quantity on hand across the stock items referencing the record.
      const sumQuantity = async (field: string) => {
        const row = await database
          .query()
          .selectFrom('stockItems')
          .select((eb) => [eb.fn.sum('totalQuantity').as('total')])
          .where(field, '=', id)
          .executeTakeFirst<{ total: unknown }>();
        return Number(row?.total ?? 0);
      };
      let devicesByStatus: Record<string, number> = {};
      const devicesBy = async (field: string) => {
        const rows = await database
          .query()
          .selectFrom('devices')
          .select((eb) => ['status', eb.fn.countAll().as('total')])
          .where(field, '=', id)
          .where('status', '!=', 'disposed')
          .groupBy('status')
          .execute<{ status: string; total: unknown }>();
        devicesByStatus = Object.fromEntries(
          rows.map((row) => [row.status, Number(row.total)]),
        );
      };
      switch (collection) {
        case 'categories':
          counts.children = await count('categories', 'parentId');
          counts.models = await count('models', 'categoryId');
          counts.softwareProducts = await count(
            'softwareProducts',
            'categoryId',
          );
          counts.stockItems = await count('stockItems', 'categoryId');
          counts.stockQuantity = await sumQuantity('categoryId');
          await devicesBy('categoryId');
          break;
        case 'models':
          counts.stockItems = await count('stockItems', 'modelId');
          counts.stockQuantity = await sumQuantity('modelId');
          await devicesBy('modelId');
          break;
        case 'manufacturers':
          counts.models = await count('models', 'manufacturerId');
          counts.softwareProducts = await count(
            'softwareProducts',
            'manufacturerId',
          );
          await devicesBy('manufacturerId');
          break;
        case 'vendors':
          counts.purchaseOrders = await count('purchaseOrders', 'vendorId');
          counts.repairs = await count('repairs', 'vendorId');
          await devicesBy('vendorId');
          break;
        case 'softwareProducts':
          counts.entitlements = await count(
            'entitlements',
            'softwareProductId',
          );
          break;
        case 'locations':
          counts.children = await count('locations', 'parentId');
          counts.stockItems = await count('stockItems', 'locationId');
          counts.people = await count('people', 'locationId');
          await devicesBy('locationId');
          break;
        case 'departments':
          counts.children = await count('departments', 'parentId');
          counts.people = await count('people', 'departmentId', {
            field: 'employmentStatus',
            op: '=',
            value: 'active',
          });
          await devicesBy('departmentId');
          break;
        case 'people': {
          // What the person holds: devices, accessory holdings, entitlements.
          const held = await this.personHoldings(id);
          counts.devices = held.devices.length;
          counts.accessories = held.stock.length;
          counts.entitlements = held.entitlementSeats.length;
          counts.holdings =
            counts.devices + counts.accessories + counts.entitlements;
          break;
        }
        default:
          break;
      }
      let attributeUsage: Record<string, number> | undefined;
      if (collection === 'categories') {
        // Which template keys still carry values decides whether a field
        // may be deleted or only hidden.
        const holders = await database
          .query()
          .selectFrom('devices')
          .select('attributes')
          .where('categoryId', '=', id)
          .execute<{ attributes: unknown }>();
        attributeUsage = {};
        for (const holder of holders) {
          const raw = holder.attributes;
          const attributes =
            typeof raw === 'string'
              ? (JSON.parse(raw) as Record<string, unknown>)
              : ((raw as Record<string, unknown> | null) ?? {});
          for (const [key, value] of Object.entries(attributes)) {
            if (value === null || value === undefined || value === '') continue;
            attributeUsage[key] = (attributeUsage[key] ?? 0) + 1;
          }
        }
      }
      const ancestors: { id: string; name: string }[] = [];
      if (TREE_COLLECTIONS.has(collection)) {
        let current = await findRaw(collection, id);
        const seen = new Set<string>([id]);
        while (current && typeof current.parentId === 'string') {
          if (seen.has(current.parentId)) break;
          seen.add(current.parentId);
          const parent = await findRaw(collection, current.parentId);
          if (!parent) break;
          ancestors.unshift({
            id: String(parent.id),
            name: String(parent.name),
          });
          current = parent;
        }
      }
      return { counts, devicesByStatus, ancestors, attributeUsage };
    },

    async deleteImpact(collection, id) {
      require(collection);
      const references: DeleteReference[] = [];
      for (const reference of REFERENCES[collection] ?? []) {
        let query = database
          .query()
          .selectFrom(reference.collection)
          .select((eb) => [eb.fn.countAll().as('total')])
          .where(reference.field, '=', id);
        for (const condition of reference.where ?? [])
          query =
            condition.value === null
              ? query.where(condition.field, 'is', null)
              : query.where(condition.field, '=', condition.value);
        const row = await query.executeTakeFirst();
        const count = Number(row?.total ?? 0);
        if (count > 0)
          references.push({
            collection: reference.collection,
            field: reference.field,
            count,
          });
      }
      return { level: references.length > 0 ? 'blocked' : 'plain', references };
    },

    async delete(collection, id, actorId, conditions) {
      require(collection);
      const existing = await database
        .query()
        .selectFrom(collection)
        .select('id')
        .where('id', '=', id)
        .where((eb) => compileAuthzScope(eb, conditions.scope))
        .executeTakeFirst();
      if (!existing) throw new RecordNotFoundError(collection, id);
      const impact = await this.deleteImpact(collection, id);
      if (impact.level === 'blocked') throw new DeleteBlockedError(impact);

      await database.transaction(async (connection) => {
        await connection.query
          .deleteFrom(collection)
          .where('id', '=', id)
          .where((eb) => compileAuthzScope(eb, conditions.scope))
          .execute();
        await history.log(
          { subjectType: collection, subjectId: id, action: 'delete', actorId },
          connection,
        );
      });
    },
  };
}
