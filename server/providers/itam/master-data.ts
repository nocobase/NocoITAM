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
  unrestricted,
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
import { addDays, addMonths, today } from './dates.js';
import type { LeaverAccounts } from './leaver-accounts.js';
import { OWNED_BY_USER, recoveryPlan, type RecoveryItem } from './recovery.js';
import { pruneKitItems } from './kit-prune.js';
import { subtreeIds } from './tree-scope.js';
import type { HistoryOrigin, HistoryService } from './history.js';

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
  /** The repair each device still at the shop is waiting on. */
  readonly openRepairs?: readonly Row[];
}

/** A record that still names somebody, and so has to change hands. */
export interface OwnedRecord {
  readonly collection: string;
  readonly id: string;
  readonly label: string;
  /** Which field names them: the 负责人, on every record that names one. */
  readonly field: 'ownerId';
  /** Who that field names **now**, which is somebody else once handed over. */
  readonly ownerId?: string | null;
  /**
   * Which of the five asset types it is, where it is an asset at all: the
   * pages tag those with their own icon, and a repair order or a purchase
   * order is not one of them.
   */
  readonly assetType?: string;
}

/**
 * 在职状态 is the two dates and nothing else: 已离职 once the leave date has
 * come, 待入职 while the joining day is still ahead, 在职 otherwise.
 *
 * It used to be a field of its own, which meant three writers — the form's
 * select, 标记离职, and the nightly job — and any two of them could disagree:
 * a status set back to 在职 with the date still in the past was reversed again
 * that night, and one set to 已离职 with no date gave a person the recovery
 * list without the leaving ever appearing on their timeline.
 *
 * So the dates are the only input and the status follows them, derived here
 * on every write and by the nightly job for a date that merely came round.
 * 待入职 (2026-10-06) only says the first day has not come: a joiner is in
 * the register before it, so a device is reserved and a kit prepared for
 * them, and only leaving refuses an assignment (`devices.ts`,
 * `entitlements.ts`).
 */
export type EmploymentStatus = 'pending' | 'active' | 'left';

export function employmentFor(
  hireDate: unknown,
  leaveDate: unknown,
  day: string,
): EmploymentStatus {
  const leave = typeof leaveDate === 'string' ? leaveDate.trim() : '';
  if (leave !== '' && leave <= day) return 'left';
  const hire = typeof hireDate === 'string' ? hireDate.trim() : '';
  return hire !== '' && hire > day ? 'pending' : 'active';
}

/** Related collections a list shows counts of, per master-data collection. */
const LIST_COUNTS: Readonly<
  Record<
    string,
    readonly {
      key: string;
      collection: string;
      field: string;
      /**
       * Extra conditions, e.g. only people still here; `null` means IS NULL,
       * and `not` turns an equality into its opposite.
       */
      where?: readonly {
        field: string;
        value: string | null;
        not?: boolean;
      }[];
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
      // Everybody not gone, 待入职 included (2026-10-06): a joiner is in the
      // department from the day they are entered.
      where: [{ field: 'employmentStatus', value: 'left', not: true }],
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
    // The vendor a disposal hands its devices to (接收方（供应商）).
    {
      key: 'disposals',
      collection: 'disposals',
      field: 'recipientVendorId',
    },
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
    /** How it reached the record, e.g. `ai` for AI 整理 (2026-10-20). */
    origin?: HistoryOrigin,
  ): Promise<Row>;
  update(
    collection: string,
    id: string,
    input: Row,
    actorId: string,
    conditions: DatabaseAuthorizationConditions,
    /** How it reached the record, e.g. `ai` for 完善 (2026-10-20). */
    origin?: HistoryOrigin,
  ): Promise<Row>;
  deleteImpact(collection: string, id: string): Promise<DeleteImpact>;
  /** Counts shown at the top of a detail page, plus the ancestors of a tree node. */
  stats(collection: string, id: string): Promise<MasterDataStats>;
  /**
   * Renames a department's position (2026-10-22), held or not: the people
   * holding it and its own kit move to the new name with it.
   */
  renamePosition(
    departmentId: string,
    from: string,
    to: string,
    actorId: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<Row>;
  /**
   * Related-record counts for every record of a collection, for list
   * columns: `{ entitlements: { [id]: n } }`.
   * Only collections in `LIST_COUNTS` have any.
   */
  listCounts(
    collection: string,
  ): Promise<Record<string, Record<string, number>>>;
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
  /**
   * Reconciles 在职状态 with the dates: leavers whose day came, people whose
   * leave was undone, and joiners whose first day came.
   */
  markDueLeavers(day: string): Promise<{
    readonly left: number;
    readonly reinstated: number;
    readonly joined: number;
  }>;
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
    connection?: DatabaseConnection,
  ): Promise<readonly OwnedRecord[]>;
  /** Writes down what is in somebody's name as they are marked left. */
  snapshotBelongings(
    id: string,
    connection?: DatabaseConnection,
  ): Promise<void>;
  /** What that snapshot holds, or undefined where none was taken. */
  belongingsSnapshot(id: string): Promise<
    | {
        readonly items: readonly RecoveryItem[];
        readonly owned: readonly OwnedRecord[];
      }
    | undefined
  >;
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
 * deleted. Purchase orders and disposals name their 负责人 by user id,
 * which is not a person id, so they cannot be matched and do not block.
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
    { collection: 'disposals', field: 'recipientVendorId' },
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
    { collection: 'onboardingKits', field: 'departmentId' },
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
  // One kit per department and position, the empty position being the
  // department's default. Scoped the other way round because an empty
  // value is skipped: the department, which is always given, is what must
  // be unique for a position, empty included.
  onboardingKits: [{ field: 'departmentId', within: 'position' }],
};

const TREE_COLLECTIONS = new Set(['locations', 'departments', 'categories']);
const PATH_COLLECTIONS = new Set(['locations', 'departments']);
const JSON_FIELDS: Readonly<Record<string, readonly string[]>> = {
  vendors: ['types'],
  categories: ['fieldTemplate'],
  onboardingKits: ['items'],
  models: ['attributes'],
  departments: ['positions'],
};

export function createMasterDataService(
  database: DatabaseManager,
  history: HistoryService,
  /**
   * What becomes of a leaver's sign-in, told after the change that made
   * them leave (or come back) has committed — never inside it, since the
   * users plugin opens a transaction of its own (`leaver-accounts.ts`).
   */
  leavers?: LeaverAccounts,
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

  /**
   * A department's 入职配置 changed (2026-10-22): a kit has no page of its
   * own, so what changed is told on its department's history — which kit,
   * and the items added, removed or changed in number, by name.
   */
  const recordKitChange = async (
    connection: DatabaseConnection,
    before: Row | undefined,
    after: Row | undefined,
    source: { readonly actorId: string; readonly origin?: HistoryOrigin },
  ): Promise<void> => {
    const kit = after ?? before;
    const departmentId = asText(kit?.departmentId);
    if (!kit || !departmentId) return;
    const REFS = [
      ['modelId', 'models'],
      ['categoryId', 'categories'],
      ['softwareProductId', 'softwareProducts'],
    ] as const;
    const itemsOf = (row: Row | undefined) => {
      const items = new Map<
        string,
        { collection: string; id: string; quantity: number }
      >();
      const list = row ? decode('onboardingKits', row).items : undefined;
      for (const entry of Array.isArray(list) ? list : []) {
        const item = (entry ?? {}) as Record<string, unknown>;
        for (const [field, collection] of REFS) {
          const id = asText(item[field]);
          if (!id) continue;
          items.set(`${collection}:${id}`, {
            collection,
            id,
            quantity: Math.max(1, Number(item.quantity) || 1),
          });
        }
      }
      return items;
    };
    const was = itemsOf(before);
    const now = itemsOf(after);
    const added = [...now].filter(([key]) => !was.has(key));
    const removed = [...was].filter(([key]) => !now.has(key));
    const changed = [...now].filter(
      ([key, item]) => was.has(key) && was.get(key)!.quantity !== item.quantity,
    );
    if (before && after && !added.length && !removed.length && !changed.length)
      return;
    const names = new Map<string, string>();
    for (const [, collection] of REFS) {
      const ids = [...was.values(), ...now.values()]
        .filter((item) => item.collection === collection)
        .map((item) => item.id);
      if (ids.length === 0) continue;
      for (const row of await connection.query
        .selectFrom(collection)
        .select(['id', 'name'])
        .where('id', 'in', ids)
        .execute<{ id: string; name: string }>())
        names.set(`${collection}:${row.id}`, row.name);
    }
    const label = (key: string) => names.get(key) ?? key.split(':')[1];
    const position = asText(kit.position) ?? null;
    await history.record(
      {
        subjectType: 'departments',
        subjectId: departmentId,
        type: 'onboardingKitChanged',
        summary: `Onboarding kit${position ? ` for ${position}` : ''} ${
          !before ? 'set' : !after ? 'removed' : 'changed'
        }`,
        payload: {
          position,
          ...(!before ? { created: true } : {}),
          ...(!after ? { deleted: true } : {}),
          added: added.map(([key, item]) => ({
            label: label(key),
            quantity: item.quantity,
          })),
          removed: removed.map(([key, item]) => ({
            label: label(key),
            quantity: item.quantity,
          })),
          changed: changed.map(([key, item]) => ({
            label: label(key),
            from: was.get(key)!.quantity,
            to: item.quantity,
          })),
        },
        actorId: source.actorId,
        ...(source.origin ? { origin: source.origin } : {}),
      },
      connection,
    );
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

  /** A department's positions, however the column came back. */
  const positionsOf = (value: unknown): string[] => {
    const list =
      typeof value === 'string'
        ? (() => {
            try {
              return JSON.parse(value) as unknown;
            } catch {
              return [];
            }
          })()
        : value;
    return Array.isArray(list) ? list.map(String) : [];
  };
  const samePosition = (a: unknown, b: unknown): boolean =>
    (asText(a) ?? '').trim().toLowerCase() ===
    (asText(b) ?? '').trim().toLowerCase();

  /**
   * A person's position is one of their department's (2026-10-06): the
   * pages offer only those, and a position that arrives otherwise — an
   * import, the assistant, a department changed under it — joins the list
   * rather than standing outside it, where no kit could ever be attached
   * to it.
   */
  const enlistPosition = async (
    connection: DatabaseConnection,
    departmentId: unknown,
    position: unknown,
  ): Promise<void> => {
    const name = asText(position)?.trim();
    const department = asText(departmentId);
    if (!name || !department) return;
    const row = await connection.query
      .selectFrom('departments')
      .select(['positions'])
      .where('id', '=', department)
      .executeTakeFirst<Row>();
    if (!row) return;
    const list = positionsOf(row.positions);
    if (list.some((known) => samePosition(known, name))) return;
    await connection.query
      .updateTable('departments')
      .set({ positions: [...list, name], updatedAt: new Date() })
      .where('id', '=', department)
      .execute();
  };

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

    async create(collection, input, actorId, conditions, origin) {
      const definition = require(collection);
      assertInputFields(input, conditions.fieldAccess?.input ?? '*');
      await assertUnique(collection, input);
      assertDepreciation(collection, input);
      const parent = await assertParent(collection, undefined, input.parentId);
      // A sub-category inherits what its parent applies to; only roots choose.
      if (collection === 'categories' && parent)
        input = { ...input, appliesTo: parent.appliesTo };
      await assertModelCategory(collection, input);
      // 在职状态 follows the dates on a create as well as an update: a
      // person entered with a date already passed — a leaver recorded after
      // the fact, or an import — was stored `active` and stayed so until the
      // nightly job came round, which is long enough for the register to say
      // somebody still works here when the file said otherwise.
      if (collection === 'people' && 'employmentStatus' in input) {
        throw new ValidationError(
          'Employment status follows the joining and leave dates and cannot be set directly',
          'employmentStatus',
        );
      }
      const id = crypto.randomUUID();
      const now = new Date();
      const values: Record<string, unknown> = {
        ...input,
        ...(collection === 'people'
          ? {
              employmentStatus: employmentFor(
                input.hireDate,
                input.leaveDate,
                today(),
              ),
              // 入职负责人 starts at whoever enters the person, as every
              // other 负责人 starts at whoever files the record.
              ...(input.onboardingOwnerId === undefined
                ? { onboardingOwnerId: actorId }
                : {}),
            }
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
          {
            subjectType: collection,
            subjectId: id,
            action: 'create',
            actorId,
            ...(origin ? { origin } : {}),
          },
          connection,
        );
        if (collection === 'people')
          await enlistPosition(
            connection,
            values.departmentId,
            values.position,
          );
        if (collection === 'onboardingKits')
          await recordKitChange(connection, undefined, values, {
            actorId,
            ...(origin ? { origin } : {}),
          });
      });
      const created = await findRaw(collection, id);
      return pickFields(
        created ?? {},
        outputFields(definition.fields, conditions),
      );
    },

    async update(collection, id, input, actorId, conditions, origin) {
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

      // 在职状态 follows the dates; see `employmentFor`. An attempt to
      // set it directly is refused rather than ignored, so a caller is told
      // the field is not theirs instead of watching the value not stick.
      if (collection === 'people' && 'employmentStatus' in input) {
        throw new ValidationError(
          'Employment status follows the joining and leave dates and cannot be set directly',
          'employmentStatus',
        );
      }
      // A department's positions: each once, and none taken away while
      // somebody still in the department holds it. A position's own kit goes
      // with it (below), since it describes a position that no longer exists.
      let removedPositions: string[] = [];
      if (collection === 'departments' && 'positions' in input) {
        const next: string[] = [];
        for (const name of positionsOf(input.positions))
          if (name.trim() && !next.some((known) => samePosition(known, name)))
            next.push(name.trim());
        input = { ...input, positions: next };
        removedPositions = positionsOf(previous.positions).filter(
          (name) => !next.some((known) => samePosition(known, name)),
        );
        if (removedPositions.length > 0) {
          const holders = await database
            .query()
            .selectFrom('people')
            .select(['position'])
            .where('departmentId', '=', id)
            .where((eb) =>
              eb.or([
                eb('employmentStatus', 'is', null),
                eb('employmentStatus', '!=', 'left'),
              ]),
            )
            .execute<Row>();
          for (const name of removedPositions) {
            const count = holders.filter((row) =>
              samePosition(row.position, name),
            ).length;
            if (count > 0)
              throw new BusinessRuleError(
                `${count} people in this department hold the position ${name}`,
                'POSITION_IN_USE',
              );
          }
        }
      }
      const values: Record<string, unknown> = {
        ...input,
        ...(collection === 'people' &&
        ('leaveDate' in input || 'hireDate' in input)
          ? {
              employmentStatus: employmentFor(
                'hireDate' in input ? input.hireDate : previous.hireDate,
                'leaveDate' in input ? input.leaveDate : previous.leaveDate,
                today(),
              ),
            }
          : {}),
        updatedAt: new Date(),
      };
      delete values.id;
      delete values.createdAt;
      delete values.createdById;

      await database.transaction(async (connection) => {
        if (
          collection === 'people' &&
          ('position' in input || 'departmentId' in input)
        )
          await enlistPosition(
            connection,
            'departmentId' in input
              ? input.departmentId
              : previous.departmentId,
            'position' in input ? input.position : previous.position,
          );
        if (removedPositions.length > 0) {
          const kits = await connection.query
            .selectFrom('onboardingKits')
            .select(['id', 'position'])
            .where('departmentId', '=', id)
            .execute<Row>();
          const gone = kits
            .filter((kit) =>
              removedPositions.some((name) => samePosition(kit.position, name)),
            )
            .map((kit) => String(kit.id));
          if (gone.length > 0)
            await connection.query
              .deleteFrom('onboardingKits')
              .where('id', 'in', gone)
              .execute();
        }
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
          { actorId, ...(origin ? { origin } : {}) },
          connection,
        );
        if (collection === 'onboardingKits')
          await recordKitChange(
            connection,
            before,
            { ...previous, ...input },
            { actorId, ...(origin ? { origin } : {}) },
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
      if (collection === 'people' && 'employmentStatus' in values) {
        if (
          values.employmentStatus === 'left' &&
          previous.employmentStatus !== 'left'
        )
          await leavers?.left(id, actorId);
        else if (
          values.employmentStatus !== 'left' &&
          previous.employmentStatus === 'left'
        )
          await leavers?.returned(id, actorId);
      }
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
      ).filter((item) => item.handling !== 'none');
      // Both halves, because both have to be settled and the progress counts
      // them together. Read unrestricted: this is the register writing down
      // a fact rather than a reader asking a question, and what each reader
      // may see of it is decided when it is read back.
      const owned = await this.personOwnedRecords(
        id,
        new Map(
          OWNED_BY_USER.map((entry) => [
            entry.collection,
            unrestricted(entry.collection, 'read'),
          ]),
        ),
        connection,
      );
      if (items.length === 0 && owned.length === 0) return;
      await history.record(
        {
          subjectType: 'people',
          subjectId: id,
          type: 'belongingsSnapshot',
          summary: `In their name when they left: ${items.length + owned.length}`,
          payload: { items, owned },
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
        | {
            items?: readonly RecoveryItem[];
            owned?: readonly OwnedRecord[];
          }
        | undefined;
      const items = payload?.items ?? [];
      const owned = payload?.owned ?? [];

      // What the snapshot settles is *which* things were in their name. Every
      // other word about them — the name, who answers for it now, what state
      // it is in — is read from the record, because that is where it lives
      // and it keeps changing after somebody leaves: a device handed to
      // another owner, an order renamed. A row rendered out of the payload
      // would quietly show last month's answer beside this month's.
      const byId = <T extends Row>(rows: readonly T[]) =>
        new Map(rows.map((entry) => [String(entry.id), entry]));
      const read = (
        collection: string,
        ids: readonly string[],
        fields: readonly string[],
      ) =>
        ids.length === 0
          ? Promise.resolve([] as Row[])
          : database
              .query()
              .selectFrom(collection)
              .select(['id', ...fields])
              .where('id', 'in', [...ids])
              .execute<Row>();

      const devices = byId(
        await read(
          'devices',
          items.filter((item) => item.kind === 'device').map((item) => item.id),
          ['deviceNo', 'name', 'status', 'ownerId'],
        ),
      );
      const stockItems = byId(
        await read(
          'stockItems',
          items
            .filter((item) => item.kind === 'stock')
            .map((item) => item.targetId),
          ['name', 'kind', 'ownerId'],
        ),
      );
      const entitlements = byId(
        await read(
          'entitlements',
          items
            .filter((item) => item.kind === 'seat')
            .map((item) => item.targetId),
          ['name', 'ownerId'],
        ),
      );

      const refreshed = items.map((item) => {
        const live =
          item.kind === 'device'
            ? devices.get(item.id)
            : item.kind === 'stock'
              ? stockItems.get(item.targetId)
              : entitlements.get(item.targetId);
        // Deleted since: the snapshot's own copy is all there is left of it.
        if (!live) return item;
        return {
          ...item,
          label:
            item.kind === 'device'
              ? `${asText(live.deviceNo) ?? ''} / ${asText(live.name) ?? ''}`.trim()
              : (asText(live.name) ?? item.label),
          ownerId: asText(live.ownerId) ?? null,
          ...(item.kind === 'device'
            ? { status: asText(live.status) ?? '' }
            : {}),
        };
      });

      const ownedNow = await Promise.all(
        OWNED_BY_USER.map(async (entry) => {
          const ids = owned
            .filter((record) => record.collection === entry.collection)
            .map((record) => record.id);
          const columns = [
            entry.label,
            entry.field,
            ...(entry.label2 ? [entry.label2] : []),
          ];
          return [
            entry.collection,
            byId(await read(entry.collection, ids, columns)),
          ] as const;
        }),
      );
      const ownedLive = new Map(ownedNow);
      const refreshedOwned = owned.map((record) => {
        const entry = OWNED_BY_USER.find(
          (candidate) => candidate.collection === record.collection,
        );
        const live = ownedLive.get(record.collection)?.get(record.id);
        if (!entry || !live) return record;
        return {
          ...record,
          ownerId: asText(live[entry.field]) ?? null,
          label: [
            asText(live[entry.label]) ?? record.label,
            entry.label2 ? asText(live[entry.label2]) : undefined,
          ]
            .filter(Boolean)
            .join(' / '),
        };
      });

      return { items: refreshed, owned: refreshedOwned };
    },

    async personOwnedRecords(id, allowed, connection) {
      const read = connection ? connection.query : database.query();
      const person = await read
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
        const columns = ['id', entry.label, entry.field];
        if (entry.label2) columns.push(entry.label2);
        if (column) columns.push(column);
        let query = read
          .selectFrom(entry.collection)
          .select(columns)
          .where((eb) => compileAuthzScope(eb, conditions.scope))
          .orderBy(entry.label, 'asc');
        // Only what is still waiting: a document that has been completed,
        // cancelled or carried out names whoever raised it as a fact about
        // what happened, not as a job for somebody else.
        if (entry.open)
          query = query.where(entry.open.column, 'in', [...entry.open.values]);
        // A record that is waiting only for a while (a joiner's 入职负责人,
        // while the joining day is near).
        if (entry.since)
          query = query.where(
            entry.since.column,
            '>=',
            addDays(today(), -entry.since.days),
          );
        const rows = await query.where(entry.field, '=', userId).execute<Row>();
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
            ownerId: asText(row[entry.field]) ?? null,
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
      // The repair a device in the shop is waiting on. The row cannot offer
      // to finish it — that is an operation on the repair, and only its own
      // 负责人 may carry it out — but saying "wait" without saying what for
      // is a dead end.
      const repairs =
        deviceIds.length === 0
          ? []
          : await read
              .selectFrom('repairs')
              .select(['id', 'repairNo', 'deviceId'])
              .where('deviceId', 'in', deviceIds)
              .where('result', '=', 'inProgress')
              .execute<Row>();
      const decode = (rows: readonly Row[]) =>
        rows.map((row) => decodeRow(row));
      return {
        openRepairs: decode(repairs),
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
      await leavers?.left(id, actorId);
      return this.personHoldings(id);
    },

    async markDueLeavers(day) {
      const due = await database
        .query()
        .selectFrom('people')
        .selectAll()
        .where('employmentStatus', 'in', ['active', 'pending'])
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
        await leavers?.left(id);
      }
      // The other direction, which was missing: a leave date cleared or moved
      // out again leaves somebody marked as left for ever, and extending a
      // notice period is not rare. The status is the dates', so the job
      // reconciles both ways — and a joining day that came round moves a
      // joiner from 待入职 to 在职 (2026-10-06).
      const others = await database
        .query()
        .selectFrom('people')
        .selectAll()
        .where('employmentStatus', 'in', ['left', 'pending'])
        .execute<Row>();
      const changed = others
        .map((person) => ({
          person,
          status: employmentFor(person.hireDate, person.leaveDate, day),
        }))
        .filter(({ person, status }) => status !== person.employmentStatus);
      const reinstated = changed.filter(
        ({ person }) => person.employmentStatus === 'left',
      );
      for (const { person, status } of changed) {
        const id = String(person.id);
        await database.transaction(async (connection) => {
          await connection.query
            .updateTable('people')
            .set({ employmentStatus: status, updatedAt: new Date() })
            .where('id', '=', id)
            .execute();
          await history.logChanges(
            { subjectType: 'people', subjectId: id },
            person,
            { employmentStatus: status },
            { sourceType: 'scheduler', origin: 'schedule' },
            connection,
          );
        });
        if (person.employmentStatus === 'left') await leavers?.returned(id);
      }
      return {
        left: due.length,
        reinstated: reinstated.length,
        joined: changed.length - reinstated.length,
      };
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
              ? query.where(
                  condition.field,
                  condition.not ? 'is not' : 'is',
                  null,
                )
              : query.where(
                  condition.field,
                  condition.not ? '!=' : '=',
                  condition.value,
                );
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

    async renamePosition(departmentId, from, to, actorId, conditions) {
      const name = to.trim();
      if (!name) throw new ValidationError('A position needs a name');
      const department = await database
        .query()
        .selectFrom('departments')
        .selectAll()
        .where('id', '=', departmentId)
        .where((eb) => compileAuthzScope(eb, conditions.scope))
        .executeTakeFirst<Row>();
      if (!department)
        throw new RecordNotFoundError('departments', departmentId);
      const positions = positionsOf(department.positions);
      const at = positions.findIndex((known) => samePosition(known, from));
      if (at < 0) throw new RecordNotFoundError('positions', from);
      // Another position by that name; the same one recased is a rename.
      if (
        positions.some(
          (known, index) => index !== at && samePosition(known, name),
        )
      )
        throw new BusinessRuleError(
          `The department already has the position ${name}`,
          'POSITION_TAKEN',
        );
      const old = positions[at];
      if (old === name) return decode('departments', department);
      const next = positions.map((known, index) =>
        index === at ? name : known,
      );
      await database.transaction(async (connection) => {
        await connection.query
          .updateTable('departments')
          .set({ positions: next, updatedAt: new Date() })
          .where('id', '=', departmentId)
          .execute();
        await history.logChanges(
          { subjectType: 'departments', subjectId: departmentId },
          { positions },
          { positions: next },
          { actorId },
          connection,
        );
        const holders = (
          await connection.query
            .selectFrom('people')
            .select(['id', 'position'])
            .where('departmentId', '=', departmentId)
            .execute<Row>()
        ).filter((row) => samePosition(row.position, old));
        for (const person of holders) {
          await connection.query
            .updateTable('people')
            .set({ position: name, updatedAt: new Date() })
            .where('id', '=', String(person.id))
            .execute();
          await history.logChanges(
            { subjectType: 'people', subjectId: String(person.id) },
            { position: person.position },
            { position: name },
            { actorId },
            connection,
          );
        }
        const kits = (
          await connection.query
            .selectFrom('onboardingKits')
            .select(['id', 'name', 'position'])
            .where('departmentId', '=', departmentId)
            .execute<Row>()
        ).filter((row) => samePosition(row.position, old));
        for (const kit of kits) {
          // A kit still named after the position, as one is made, follows.
          const named = asText(kit.name) ?? '';
          await connection.query
            .updateTable('onboardingKits')
            .set({
              position: name,
              ...(named.endsWith(old)
                ? { name: `${named.slice(0, -old.length)}${name}` }
                : {}),
              updatedAt: new Date(),
            })
            .where('id', '=', String(kit.id))
            .execute();
        }
      });
      return (await this.get('departments', departmentId, conditions))!;
    },

    async stats(collection, id) {
      require(collection);
      // A tree node counts what its descendants hold too (2026-10-21, one
      // rule for categories, locations and departments), as its tabs list
      // it; its children stay its own.
      const scope =
        collection === 'categories' ||
        collection === 'locations' ||
        collection === 'departments'
          ? [...(await subtreeIds(database, collection, [id]))]
          : [id];
      const count = async (
        table: string,
        field: string,
        extra?: {
          field: string;
          op: 'in' | 'not in' | '=';
          value: string | string[];
        },
        ids: readonly string[] = [id],
      ) => {
        let query = database
          .query()
          .selectFrom(table)
          .select((eb) => [eb.fn.countAll().as('total')])
          .where(field, 'in', [...ids]);
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
          .where(field, 'in', scope)
          .executeTakeFirst<{ total: unknown }>();
        return Number(row?.total ?? 0);
      };
      let devicesByStatus: Record<string, number> = {};
      const devicesBy = async (field: string) => {
        const rows = await database
          .query()
          .selectFrom('devices')
          .select((eb) => ['status', eb.fn.countAll().as('total')])
          .where(field, 'in', scope)
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
          counts.models = await count('models', 'categoryId', undefined, scope);
          counts.softwareProducts = await count(
            'softwareProducts',
            'categoryId',
            undefined,
            scope,
          );
          counts.stockItems = await count(
            'stockItems',
            'categoryId',
            undefined,
            scope,
          );
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
          counts.disposals = await count('disposals', 'recipientVendorId');
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
          counts.stockItems = await count(
            'stockItems',
            'locationId',
            undefined,
            scope,
          );
          // As a department's (2026-10-21): everybody not gone.
          counts.people = await count(
            'people',
            'locationId',
            { field: 'employmentStatus', op: 'not in', value: ['left'] },
            scope,
          );
          await devicesBy('locationId');
          break;
        case 'departments':
          counts.children = await count('departments', 'parentId');
          // Everybody not gone, 待入职 included, as the list counts them.
          counts.people = await count(
            'people',
            'departmentId',
            { field: 'employmentStatus', op: 'not in', value: ['left'] },
            scope,
          );
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
        // may be deleted or only hidden — on a device, or on a model when
        // the field is one its devices share.
        const holders = [
          ...(await database
            .query()
            .selectFrom('devices')
            .select('attributes')
            .where('categoryId', '=', id)
            .execute<{ attributes: unknown }>()),
          ...(await database
            .query()
            .selectFrom('models')
            .select('attributes')
            .where('categoryId', '=', id)
            .execute<{ attributes: unknown }>()),
        ];
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
        .selectAll()
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
        if (collection === 'onboardingKits')
          await recordKitChange(connection, existing, undefined, { actorId });
        // What a kit named goes out of it with the record.
        if (['models', 'categories', 'softwareProducts'].includes(collection))
          await pruneKitItems(connection);
      });
    },
  };
}
