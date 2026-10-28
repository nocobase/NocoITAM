import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { Row } from './collection-query.js';
import { today } from './dates.js';
import type { OperationContext } from './devices.js';
import { documentText, type ReadDocument } from './document-text.js';
import {
  BusinessRuleError,
  RecordNotFoundError,
  ValidationError,
} from './errors.js';
import {
  addStats,
  batchSerials,
  checkBatch,
  EMPTY_STATS,
  planReceipt,
  receiptStats,
  type BatchLine,
  type PlanLine,
  type ReceiptDraft,
  type ReceiptIssue,
  type ReceiptPlan,
  type ReceiptStats,
} from './receipt-plan.js';

/**
 * Where a run stands. It starts `reading` while the assistant reads the
 * document, becomes `drafted` once its proposal has been through the rules,
 * and ends `saved` (the receiver received the batch), `discarded` (closed
 * without saving) or `failed` (the assistant could not read it).
 */
export const RECEIPT_RUN_STATUSES = [
  'reading',
  'drafted',
  'saved',
  'discarded',
  'failed',
] as const;
export type ReceiptRunStatus = (typeof RECEIPT_RUN_STATUSES)[number];

const OPEN: ReadonlySet<string> = new Set(['reading', 'drafted']);

export interface ReceiptRunSummary {
  /** Runs by how they ended (or stand). */
  readonly runs: Readonly<Record<ReceiptRunStatus, number>>;
  /** What the receivers kept of the saved runs' plans, field by field. */
  readonly fields: ReceiptStats;
}

/**
 * The runs of the assistant reading delivery documents
 * (`202610050003_receipt_runs`). Each belongs to the person who started it:
 * only they move it on, because the run carries their grants. The route
 * authorizes the order (`receive`) before anything here is reached.
 */
export interface ReceiptRunService {
  start(
    orderId: string,
    input: {
      readonly fileId?: string | null;
      readonly documentName: string;
      /** What the receiver pasted, read with the file or in its place. */
      readonly text?: string | null;
    },
    context: OperationContext,
  ): Promise<Row>;
  /** Runs the assistant's proposal through the rules and keeps both. */
  draft(
    orderId: string,
    runId: string,
    draft: ReceiptDraft,
    context: OperationContext,
  ): Promise<{ readonly run: Row; readonly plan: ReceiptPlan }>;
  fail(
    orderId: string,
    runId: string,
    reason: string,
    context: OperationContext,
  ): Promise<Row>;
  discard(
    orderId: string,
    runId: string,
    context: OperationContext,
  ): Promise<Row>;
  /** The issues a batch, as the form holds it, would meet. */
  check(
    orderId: string,
    batch: readonly BatchLine[],
    connection?: DatabaseConnection,
  ): Promise<ReceiptIssue[]>;
  /** The order's lines as the rules read them. */
  planLines(
    orderId: string,
    connection?: DatabaseConnection,
  ): Promise<PlanLine[]>;
  /**
   * Marks a drafted run saved with what was received, inside the receipt's
   * own transaction, and returns the plan it was drafted on.
   */
  finishWithin(
    connection: DatabaseConnection,
    orderId: string,
    runId: string,
    saved: readonly BatchLine[],
    context: OperationContext,
  ): Promise<ReceiptPlan>;
  recent(limit: number): Promise<Row[]>;
  summary(): Promise<ReceiptRunSummary>;
}

export const receiptRunServiceToken: ServiceToken<ReceiptRunService> =
  createServiceToken<ReceiptRunService>('itam/receipt-run-service');

const parse = <T>(value: unknown): T | undefined =>
  typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);

export function createReceiptRunService(deps: {
  readonly database: DatabaseManager;
  /** Reads the document's text; absent where files cannot be read. */
  readonly readDocument?: ReadDocument;
}): ReceiptRunService {
  const { database, readDocument } = deps;
  const query = (connection?: DatabaseConnection) =>
    connection ? connection.query : database.query();

  const load = async (
    orderId: string,
    runId: string,
    context: OperationContext,
    connection?: DatabaseConnection,
  ): Promise<Row> => {
    const run = await query(connection)
      .selectFrom('receiptRuns')
      .selectAll()
      .where('id', '=', runId)
      .where('purchaseOrderId', '=', orderId)
      .executeTakeFirst<Row>();
    if (!run) throw new RecordNotFoundError('receiptRuns', runId);
    // The run carries its starter's grants; nobody else moves it on.
    if (run.actorId !== context.actorId)
      throw new BusinessRuleError(
        'Only whoever started this run may continue it',
        'NOT_RUN_ACTOR',
      );
    return run;
  };

  const requireOpen = (run: Row, statuses: ReadonlySet<string> = OPEN) => {
    if (!statuses.has(String(run.status)))
      throw new BusinessRuleError(
        `This run is already ${String(run.status)}`,
        'RUN_CLOSED',
      );
  };

  const update = async (
    runId: string,
    values: Record<string, unknown>,
    connection?: DatabaseConnection,
  ): Promise<Row> => {
    await query(connection)
      .updateTable('receiptRuns')
      .set({ ...values, updatedAt: new Date() })
      .where('id', '=', runId)
      .execute();
    return (await query(connection)
      .selectFrom('receiptRuns')
      .selectAll()
      .where('id', '=', runId)
      .executeTakeFirst<Row>()) as Row;
  };

  const planLines = async (
    orderId: string,
    connection?: DatabaseConnection,
  ): Promise<PlanLine[]> => {
    const lines = await query(connection)
      .selectFrom('purchaseOrderLines')
      .selectAll()
      .where('purchaseOrderId', '=', orderId)
      .orderBy('sort', 'asc')
      .execute<Row>();
    const modelIds = [
      ...new Set(lines.map((line) => line.modelId).filter(Boolean)),
    ] as string[];
    const models =
      modelIds.length > 0
        ? await query(connection)
            .selectFrom('models')
            .select(['id', 'code', 'categoryId'])
            .where('id', 'in', modelIds)
            .execute<{ id: string; code: string | null; categoryId: string }>()
        : [];
    const categoryIds = [...new Set(models.map((model) => model.categoryId))];
    const categories =
      categoryIds.length > 0
        ? await query(connection)
            .selectFrom('categories')
            .select(['id', 'requiresSerial'])
            .where('id', 'in', categoryIds)
            .execute<{ id: string; requiresSerial: unknown }>()
        : [];
    const modelById = new Map(models.map((model) => [model.id, model]));
    const serialRequired = new Map(
      categories.map((category) => [
        category.id,
        Boolean(category.requiresSerial),
      ]),
    );
    return lines.map((line) => {
      const model =
        typeof line.modelId === 'string'
          ? modelById.get(line.modelId)
          : undefined;
      return {
        id: String(line.id),
        itemType: String(line.itemType),
        modelCode: model?.code ?? null,
        outstanding: Math.max(
          0,
          Number(line.quantity) - Number(line.receivedQuantity),
        ),
        requiresSerial: model
          ? (serialRequired.get(model.categoryId) ?? false)
          : false,
      };
    });
  };

  const registered = async (
    batch: readonly BatchLine[],
    connection?: DatabaseConnection,
  ): Promise<Set<string>> => {
    const serials = batchSerials(batch);
    if (serials.length === 0) return new Set();
    const rows = await query(connection)
      .selectFrom('devices')
      .select('serialNo')
      .where('serialNo', 'in', serials)
      .execute<{ serialNo: string }>();
    return new Set(rows.map((row) => row.serialNo));
  };

  const check: ReceiptRunService['check'] = async (
    orderId,
    batch,
    connection,
  ) =>
    checkBatch(
      batch,
      await planLines(orderId, connection),
      await registered(batch, connection),
    );

  return {
    planLines,
    check,

    async start(orderId, input, context) {
      const order = await database
        .query()
        .selectFrom('purchaseOrders')
        .select(['id', 'status', 'ownerId'])
        .where('id', '=', orderId)
        .executeTakeFirst<Row>();
      if (!order) throw new RecordNotFoundError('purchaseOrders', orderId);
      if (!['ordered', 'partiallyReceived'].includes(String(order.status)))
        throw new BusinessRuleError(
          'Only an order that has been placed can be received',
          'INVALID_TRANSITION',
        );
      const name = input.documentName.trim();
      if (!name)
        throw new ValidationError('documentName is required', 'documentName');
      const now = new Date();
      const id = crypto.randomUUID();
      await database
        .query()
        .insertInto('receiptRuns')
        .values({
          id,
          purchaseOrderId: orderId,
          fileId: input.fileId ?? null,
          documentName: name.slice(0, 255),
          actorId: context.actorId,
          ownerId: order.ownerId ?? null,
          // The one trigger so far: a person handing the assistant a
          // document. A run never starts itself.
          trigger: 'upload',
          status: 'reading',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      // A document the server cannot read as text — a picture, a format no
      // loader takes, a file that fails to parse — leaves the text empty,
      // and the page sends the file itself to a model that may read it.
      const document =
        input.fileId && readDocument
          ? await readDocument(input.fileId).catch(() => undefined)
          : undefined;
      // Pasted text (2026-10-23) reads before the file's, or alone.
      const pasted = documentText(input.text ?? '');
      const combined = [pasted?.text, document?.text]
        .filter(Boolean)
        .join('\n\n');
      if (combined)
        await database
          .query()
          .updateTable('receiptRuns')
          .set({ documentText: combined })
          .where('id', '=', id)
          .execute();
      return (await database
        .query()
        .selectFrom('receiptRuns')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst<Row>()) as Row;
    },

    async draft(orderId, runId, draft, context) {
      const run = await load(orderId, runId, context);
      requireOpen(run, new Set(['reading']));
      const lines = await planLines(orderId);
      const planned = planReceipt(draft, lines, today());
      // The register check needs the database; the rest of the plan's
      // issues are the rules' own.
      const plan: ReceiptPlan = {
        ...planned,
        issues: [
          ...planned.issues.filter(
            (entry) =>
              entry.code !== 'duplicateInBatch' &&
              entry.code !== 'overReceipt' &&
              entry.code !== 'serialRequired',
          ),
          ...(await check(
            orderId,
            planned.lines.map((line) => ({
              lineId: line.lineId,
              quantity: line.quantity,
              serialNos: line.units.map((unit) => unit.serialNo),
            })),
          )),
        ],
      };
      const updated = await update(runId, {
        status: 'drafted',
        draft,
        plan,
      });
      return { run: updated, plan };
    },

    async fail(orderId, runId, reason, context) {
      const run = await load(orderId, runId, context);
      requireOpen(run);
      return update(runId, {
        status: 'failed',
        failure: reason.slice(0, 2000),
        finishedAt: new Date(),
      });
    },

    async discard(orderId, runId, context) {
      const run = await load(orderId, runId, context);
      // Closing a run that already ended is not an error: the dialog lets
      // go of whatever it held.
      if (!OPEN.has(String(run.status))) return run;
      return update(runId, { status: 'discarded', finishedAt: new Date() });
    },

    async finishWithin(connection, orderId, runId, saved, context) {
      const run = await load(orderId, runId, context, connection);
      requireOpen(run, new Set(['drafted']));
      const plan = parse<ReceiptPlan>(run.plan);
      if (!plan)
        throw new BusinessRuleError('This run has no plan', 'RUN_CLOSED');
      await update(
        runId,
        {
          status: 'saved',
          final: saved,
          stats: receiptStats(plan, saved),
          finishedAt: new Date(),
        },
        connection,
      );
      return plan;
    },

    async recent(limit) {
      const runs = await database
        .query()
        .selectFrom('receiptRuns')
        .select([
          'id',
          'purchaseOrderId',
          'documentName',
          'actorId',
          'ownerId',
          'status',
          'stats',
          'failure',
          'createdAt',
          'finishedAt',
        ])
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .execute<Row>();
      // The order by its number, which is what a reader recognises it by.
      const orderIds = [
        ...new Set(runs.map((run) => String(run.purchaseOrderId))),
      ];
      const orders =
        orderIds.length > 0
          ? await database
              .query()
              .selectFrom('purchaseOrders')
              .select(['id', 'orderNo'])
              .where('id', 'in', orderIds)
              .execute<{ id: string; orderNo: string }>()
          : [];
      const numbers = new Map(orders.map((order) => [order.id, order.orderNo]));
      return runs.map((run) => ({
        ...run,
        stats: parse<ReceiptStats>(run.stats) ?? null,
        orderNo: numbers.get(String(run.purchaseOrderId)) ?? null,
      }));
    },

    async summary() {
      const rows = await database
        .query()
        .selectFrom('receiptRuns')
        .select(['status', 'stats'])
        .execute<{ status: string; stats: unknown }>();
      const runs = Object.fromEntries(
        RECEIPT_RUN_STATUSES.map((status) => [status, 0]),
      ) as Record<ReceiptRunStatus, number>;
      let fields = EMPTY_STATS;
      for (const row of rows) {
        if (row.status in runs) runs[row.status as ReceiptRunStatus] += 1;
        const stats = parse<ReceiptStats>(row.stats);
        if (row.status === 'saved' && stats) fields = addStats(fields, stats);
      }
      return { runs, fields };
    },
  };
}
