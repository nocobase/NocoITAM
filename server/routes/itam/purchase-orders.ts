import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type DatabaseAuthorizationConditions,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';
import { z } from 'zod';

import {
  approvalServiceToken,
  historyServiceToken,
  procurementServiceToken,
  documentReaderToken,
  receiptRunServiceToken,
} from '../../providers/index.js';
import { RecordNotFoundError } from '../../providers/itam/errors.js';
import { matchPurchaseCapture } from '../../providers/itam/purchase-capture.js';
import { draftJoinerOrders } from '../../providers/itam/onboarding-orders.js';
import { onboardingServiceToken } from '../../providers/itam/onboarding.js';
import { outputFields, pickFields } from '../../providers/itam/authz-filter.js';
import {
  LINE_ITEM_TYPES,
  PO_REASONS,
} from '../../providers/itam/procurement.js';
import { lifecycleDescriptionView } from '@nocobase/lifecycle';

import { PURCHASE_ORDER_LIFECYCLE } from '../../lifecycles/purchase-orders.js';
import { approverDirectoryToken } from '../../providers/itam/approvers.js';
import { ITAM_SETTINGS_RESOURCE } from '../../providers/itam/collections.js';
import { lifecycleRuntimeToken } from '../../providers/itam/lifecycles.js';
import { createCrudRoutes } from './crud-routes.js';
import { listWithMine } from './mine-view.js';
import {
  decideCollection,
  errorResponse,
  principalId,
  readJsonObject,
  requireGrant,
} from './http.js';
import {
  comparisonInputSchema,
  quoteComparisonServiceToken,
} from '../../providers/itam/quote-comparisons.js';

/** `/api/itam/purchase-orders`: lines, the approval steps, ordering and receiving. */
const id = z.string().min(1).max(64);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// The vendor it goes to is stated when the request is written, and so is
// the department it is for, when it is for one. The update schema is this one partial, so an order made
// before the vendor was required keeps what it has until it is edited.
const orderSchema = z.object({
  reason: z.enum(PO_REASONS),
  description: z.string().max(20000).nullable().optional(),
  ownerId: id.optional(),
  departmentId: id.nullable().optional(),
  neededBy: date.nullable().optional(),
  vendorId: id,
  currency: z.string().trim().max(8).nullable().optional(),
  expectedAt: date.nullable().optional(),
});

const lineSchema = z.object({
  id: id.optional(),
  itemType: z.enum(LINE_ITEM_TYPES),
  modelId: id.nullable().optional(),
  softwareProductId: id.nullable().optional(),
  quantity: z.number().int().min(1).max(10000),
  unitPrice: z.number().min(0).nullable().optional(),
});

const receiveSchema = z
  .object({
    lineId: id,
    quantity: z.number().int().min(1).max(10000),
    notes: z.string().max(2000).nullable().optional(),
    serialNos: z.array(z.string().max(128)).optional(),
    locationId: id.optional(),
    stockItemId: id.nullable().optional(),
    entitlementId: id.nullable().optional(),
    extra: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const batchLineSchema = z
  .object({
    lineId: id,
    quantity: z.number().int().min(0).max(10000),
    serialNos: z.array(z.string().max(128)).max(10000).optional(),
  })
  .strict();

/**
 * What the assistant read from a delivery document (`prefillReceipt`). Held
 * loosely where a document may say nothing, and bounded so a run cannot
 * store an arbitrary payload.
 */
const draftSchema = z
  .object({
    deliveryNo: z.string().max(128).nullable().optional(),
    deliveryDate: z.string().max(32).nullable().optional(),
    vendorName: z.string().max(255).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    rows: z
      .array(
        z
          .object({
            lineId: z.string().max(64).nullable(),
            description: z.string().max(500),
            partCode: z.string().max(128).nullable().optional(),
            quantity: z.number().min(0).max(10000),
            serialNos: z.array(z.string().max(128)).max(10000).optional(),
            source: z.string().max(200).nullable().optional(),
            warrantyMonths: z
              .number()
              .int()
              .min(0)
              .max(240)
              .nullable()
              .optional(),
            warrantyEndDate: z.string().max(32).nullable().optional(),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();

/**
 * What the assistant read for a new order (`fillPurchaseOrder` in the create
 * dialog), bounded like the receipt draft: the matching reads it, nothing
 * stores it.
 */
const nullableText = (limit: number) =>
  z.string().max(limit).nullable().optional();
const captureSchema = z
  .object({
    reason: nullableText(64),
    description: nullableText(20000),
    neededBy: nullableText(32),
    vendorId: nullableText(64),
    vendorName: nullableText(255),
    departmentId: nullableText(64),
    departmentName: nullableText(255),
    uncertain: z.array(z.string().max(64)).max(20).optional(),
    lines: z
      .array(
        z
          .object({
            itemType: nullableText(32),
            modelId: nullableText(64),
            softwareProductId: nullableText(64),
            description: nullableText(500),
            partCode: nullableText(128),
            quantity: z.number().min(0).max(10000).nullable().optional(),
            unitPrice: z.number().min(0).nullable().optional(),
            uncertain: z.boolean().nullable().optional(),
            source: nullableText(200),
          })
          .strict(),
      )
      .max(200)
      .optional(),
  })
  .strict();

/** How long an upload may wait unattached before AI 整理 reads it. */
const CAPTURE_UPLOAD_WINDOW_MS = 60 * 60 * 1000;

/**
 * A line as the caller may read it. Lines are a collection of their own, so
 * reading the order does not open them: a role without cost access reads
 * every line field but the unit price. The id stays, since editing and
 * receiving a line name it.
 */
function readableLines(
  lines: readonly Readonly<Record<string, unknown>>[],
  conditions: DatabaseAuthorizationConditions,
): Readonly<Record<string, unknown>>[] {
  return lines.map((line) => ({
    ...pickFields(line, outputFields(Object.keys(line), conditions)),
    id: line.id,
  }));
}

const draftForJoinersSchema = z
  .object({
    personId: z.string().min(1).max(64).optional(),
    keys: z.array(z.string().min(1).max(200)).max(200).optional(),
    vendors: z
      .record(z.string().max(200), z.string().min(1).max(64))
      .optional(),
    locale: z.string().max(16).optional(),
  })
  .strict();

export const purchaseOrderRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const authorization = app.container.resolve(authorizationToken);
    const procurement = app.container.resolve(procurementServiceToken);
    const approvals = app.container.resolve(approvalServiceToken);
    const history = app.container.resolve(historyServiceToken);
    const lifecycles = app.container.resolve(lifecycleRuntimeToken);
    const approverDirectory = app.container.resolve(approverDirectoryToken);
    const approverRangeSchema = z.object({
      anyone: z.boolean(),
      roles: z.array(z.string().min(1).max(128)).max(50),
      users: z.array(z.string().min(1).max(64)).max(100),
      revision: z.number().int().nonnegative(),
      requestId: z.string().min(1).max(128),
    });
    const receiptRuns = app.container.resolve(receiptRunServiceToken);
    const readDocument = app.container.resolve(documentReaderToken);
    const database = app.container.resolve(databaseManagerToken);
    const quotes = app.container.resolve(quoteComparisonServiceToken);
    /** The order must be one the caller's grant reaches, not merely exist. */
    const visible = async (
      orderId: string,
      conditions: DatabaseAuthorizationConditions,
    ) => {
      if (!(await procurement.get(orderId, conditions)))
        throw new RecordNotFoundError('purchaseOrders', orderId);
    };

    const routes = createCrudRoutes({
      collection: 'purchaseOrders',
      service: procurement,
      history,
      // 我的 and 待我审批, and whether each row waits on this reader
      // (2026-10-20): what waits on whom lives in the approval, not the
      // record (`mine-view.ts`).
      list: listWithMine({
        database,
        approvals,
        collection: 'purchaseOrders',
        subjectType: 'purchaseOrder',
        list: (options, conditions) => procurement.list(options, conditions),
      }),
      createSchema: orderSchema,
      // 负责人 is editable like the rest of what the order asks for: the
      // service freezes it with them once the order is approved
      // (`SETTLED_EDITABLE`), and until then a request may be handed over
      // rather than cancelled and asked again.
      updateSchema: orderSchema.partial(),
      middleware: [auth.required(), authorization.middleware()],
      before: (routes, { decide, operationContext, operation }) => {
        // 设置 → 流程 → 采购 (2026-10-19): the lifecycle as its flowchart
        // draws it, from source, and whom a submitter may ask to approve —
        // read by anybody who may read orders, changed under the settings'
        // own grant.
        routes.get('/lifecycle', async (context) => {
          try {
            await decide(context, 'read');
            return context.json({
              data: lifecycleDescriptionView(
                lifecycles,
                PURCHASE_ORDER_LIFECYCLE,
              ),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.get('/lifecycle/approvers', async (context) => {
          try {
            await decide(context, 'read');
            return context.json({
              data: await approverDirectory.approverRangeView('purchaseOrder'),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.put(
          '/lifecycle/approvers',
          requireGrant(ITAM_SETTINGS_RESOURCE, 'update'),
          async (context) => {
            try {
              const input = approverRangeSchema.parse(
                await readJsonObject(context),
              );
              return context.json({
                data: await approverDirectory.saveApproverRange(
                  'purchaseOrder',
                  input,
                  principalId(context),
                ),
              });
            } catch (error) {
              return errorResponse(context, error);
            }
          },
        );
        // AI 整理 in the create dialog, before the order exists: both ask for
        // `create`, the grant the dialog itself needs. Registered first, so
        // `capture` is never read as an order id.
        routes.post('/capture/match', async (context) => {
          try {
            // Organising a new order is a create; reading a document into a
            // draft's lines (解析单据) is an update of that draft.
            await decide(context, 'create').catch(() =>
              decide(context, 'update'),
            );
            const input = captureSchema.parse(await readJsonObject(context));
            return context.json({
              data: await matchPurchaseCapture(database, input),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        // 起草采购单 for joiners (2026-10-22): a draft per vendor and joiner
        // for what they are short of, the vendor where each item was last
        // bought (`onboarding-orders.ts`); an item with none comes back
        // to be named. Registered before the `/:id` routes.
        routes.post('/draft-for-joiners', async (context) => {
          try {
            const conditions = await decide(context, 'create');
            await decideCollection(context, 'people', 'read');
            const lineConditions = await decideCollection(
              context,
              'purchaseOrderLines',
              'read',
            );
            const input = draftForJoinersSchema.parse(
              await readJsonObject(context),
            );
            return context.json({
              data: await draftJoinerOrders(
                {
                  database,
                  onboarding: app.container.resolve(onboardingServiceToken),
                  procurement,
                },
                input,
                operationContext(context),
                conditions,
                lineConditions,
              ),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        // The text of a document uploaded for AI 整理. There is no order to
        // attach it to yet, so only a file attached to nothing, and uploaded
        // within the hour, is read: an id alone does not open somebody
        // else's attachment. The dialog attaches it to the order it saves.
        routes.post('/capture/document-text', async (context) => {
          try {
            await decide(context, 'create');
            const { fileId } = z
              .object({ fileId: id })
              .strict()
              .parse(await readJsonObject(context));
            const fresh = await database
              .query()
              .selectFrom('itamFiles')
              .select('id')
              .where('id', '=', fileId)
              // The file plugin stamps its rows in UTC without the `Z`
              // (`toISOString().slice(0, -1)`), not in the local form
              // `dbDateTime()` writes, so the window is compared that way.
              .where(
                'createdAt',
                '>=',
                new Date(Date.now() - CAPTURE_UPLOAD_WINDOW_MS)
                  .toISOString()
                  .slice(0, -1),
              )
              .where((eb) =>
                eb.not(
                  eb.exists(
                    eb
                      .selectFrom('attachmentLinks')
                      .select('id')
                      .whereRef('attachmentLinks.fileId', '=', 'itamFiles.id'),
                  ),
                ),
              )
              .executeTakeFirst();
            if (!fresh) throw new RecordNotFoundError('itamFiles', fileId);
            const document = await readDocument(fileId).catch(() => undefined);
            return context.json({
              data: {
                text: document?.text ?? null,
                truncated: document?.truncated ?? false,
              },
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.get('/:id/lines', async (context) => {
          try {
            const conditions = await decide(context, 'read');
            if (!(await procurement.get(context.req.param('id'), conditions)))
              return context.json(
                { code: 'NOT_FOUND', message: 'Record not found' },
                404,
              );
            return context.json({
              data: readableLines(
                await procurement.lines(context.req.param('id')),
                await decideCollection(context, 'purchaseOrderLines', 'read'),
              ),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        // 报价比较 (2026-10-17): the quotes the order was weighed against,
        // with the table counted from them. Prices answer to the lines'
        // own read grant, as the lines' unit prices do.
        routes.get('/:id/quote-comparison', async (context) => {
          try {
            const orderId = context.req.param('id');
            await visible(orderId, await decide(context, 'read'));
            const lineConditions = await decideCollection(
              context,
              'purchaseOrderLines',
              'read',
            );
            return context.json({
              data: await quotes.view(orderId, {
                prices: outputFields(['unitPrice'], lineConditions).includes(
                  'unitPrice',
                ),
              }),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.put('/:id/lines', async (context) => {
          try {
            const body = z
              .object({ lines: z.array(lineSchema.strict()).max(200) })
              .strict()
              .parse(await context.req.json());
            const conditions = await decide(context, 'update');
            // Lines are a collection of their own: what the caller may read
            // there decides what they may state here (a role without cost
            // access sees no unit price, so it neither writes nor clears one).
            const lineConditions = await decideCollection(
              context,
              'purchaseOrderLines',
              'read',
            );
            return context.json({
              data: readableLines(
                await procurement.setLines(
                  context.req.param('id'),
                  body.lines,
                  operationContext(context),
                  conditions,
                  lineConditions,
                ),
                lineConditions,
              ),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.get('/:id/approvals', async (context) => {
          try {
            const conditions = await decide(context, 'read');
            if (!(await procurement.get(context.req.param('id'), conditions)))
              return context.json(
                { code: 'NOT_FOUND', message: 'Record not found' },
                404,
              );
            return context.json({
              data: await approvals.forSubject(
                'purchaseOrder',
                context.req.param('id'),
              ),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        routes.get('/:id/receipts', async (context) => {
          try {
            const conditions = await decide(context, 'read');
            if (!(await procurement.get(context.req.param('id'), conditions)))
              return context.json(
                { code: 'NOT_FOUND', message: 'Record not found' },
                404,
              );
            return context.json({
              data: {
                receipts: await procurement.receipts(context.req.param('id')),
                generated: await procurement.generated(context.req.param('id')),
              },
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        operation('submit', 'submit', (context, orderId, body, conditions) =>
          procurement.submit(
            orderId,
            z.object({ approverId: id.optional() }).strict().parse(body)
              .approverId,
            operationContext(context),
            conditions,
          ),
        );
        operation('withdraw', 'submit', (context, orderId, _body, conditions) =>
          procurement.withdraw(orderId, operationContext(context), conditions),
        );
        operation('decide', 'approve', (context, orderId, body, conditions) => {
          const input = z
            .object({
              decision: z.enum(['approved', 'rejected']),
              comment: z.string().max(2000).optional(),
            })
            .strict()
            .parse(body);
          return procurement.decide(
            orderId,
            input.decision,
            input.comment,
            operationContext(context),
            conditions,
          );
        });
        operation('order', 'order', (context, orderId, body, conditions) =>
          procurement.markOrdered(
            orderId,
            // Placing the order answers both dates at once: when it went
            // out, and what the vendor promised. Neither reads on the page
            // before this, so neither may be left out here.
            z
              .object({ orderedAt: date, expectedAt: date })
              .strict()
              .parse(body),
            operationContext(context),
            conditions,
          ),
        );
        operation('receive', 'receive', (context, orderId, body, conditions) =>
          procurement.receive(
            orderId,
            receiveSchema.parse(body),
            operationContext(context),
            conditions,
          ),
        );
        // The batch receiving form: several lines in one transaction, filled
        // by hand or prepared from a delivery document (`runId`).
        operation(
          'receive-batch',
          'receive',
          (context, orderId, body, conditions) =>
            procurement.receiveBatch(
              orderId,
              z
                .object({
                  runId: id.nullable().optional(),
                  receipts: z.array(receiveSchema).min(1).max(200),
                })
                .strict()
                .parse(body),
              operationContext(context),
              conditions,
            ),
        );
        // What the batch form would run into as it stands — over-receipt,
        // a serial twice or already on the books, a missing required
        // serial — asked while it is edited, before 入库 is offered.
        operation(
          'receipt-check',
          'receive',
          async (_context, orderId, body, conditions) => {
            await visible(orderId, conditions);
            return receiptRuns.check(
              orderId,
              z
                .object({ lines: z.array(batchLineSchema).max(200) })
                .strict()
                .parse(body).lines,
            );
          },
        );
        // 解析单据: the text of a document attached to this order — a
        // quote, an invoice, a delivery note — for the assistant to fill the
        // draft's lines from. The page puts it in the message itself: a file
        // attached to the chat is parsed for its own request only, and the
        // turn resumes once the page tool is approved, after which the
        // assistant no longer had it. Only a file linked to this order is
        // read, under the grant that edits its lines.
        operation(
          'document-text',
          'update',
          async (_context, orderId, body, conditions) => {
            await visible(orderId, conditions);
            const { fileId } = z.object({ fileId: id }).strict().parse(body);
            const linked = await database
              .query()
              .selectFrom('attachmentLinks')
              .select('id')
              .where('ownerType', '=', 'purchaseOrders')
              .where('ownerId', '=', orderId)
              .where('fileId', '=', fileId)
              .executeTakeFirst();
            if (!linked) throw new RecordNotFoundError('itamFiles', fileId);
            const document = await readDocument(fileId).catch(() => undefined);
            return {
              text: document?.text ?? null,
              truncated: document?.truncated ?? false,
            };
          },
        );
        // Saving it, as the order's requester while its lines may change.
        operation(
          'quote-comparison',
          'update',
          async (context, orderId, body, conditions) => {
            await visible(orderId, conditions);
            return quotes.save(
              orderId,
              comparisonInputSchema.parse(body),
              principalId(context),
            );
          },
        );
        // Receiving by delivery document: a run is started when the
        // receiver hands the assistant the document, and it is theirs —
        // the service refuses anybody else's hand on it.
        operation(
          'receipt-runs',
          'receive',
          async (context, orderId, body, conditions) => {
            await visible(orderId, conditions);
            return receiptRuns.start(
              orderId,
              z
                .object({
                  fileId: id.nullable().optional(),
                  documentName: z.string().trim().min(1).max(255),
                })
                .strict()
                .parse(body),
              operationContext(context),
            );
          },
        );
        routes.post('/:id/receipt-runs/:runId/:step', async (context) => {
          try {
            const orderId = context.req.param('id');
            const runId = context.req.param('runId');
            const step = z
              .enum(['draft', 'fail', 'discard'])
              .parse(context.req.param('step'));
            await visible(orderId, await decide(context, 'receive'));
            const body =
              context.req.header('content-length') === '0' ||
              !context.req.header('content-type')
                ? {}
                : await readJsonObject(context);
            const actor = operationContext(context);
            if (step === 'draft')
              return context.json({
                data: await receiptRuns.draft(
                  orderId,
                  runId,
                  draftSchema.parse(body),
                  actor,
                ),
              });
            if (step === 'fail')
              return context.json({
                data: await receiptRuns.fail(
                  orderId,
                  runId,
                  z
                    .object({ reason: z.string().trim().min(1).max(2000) })
                    .strict()
                    .parse(body).reason,
                  actor,
                ),
              });
            return context.json({
              data: await receiptRuns.discard(orderId, runId, actor),
            });
          } catch (error) {
            return errorResponse(context, error);
          }
        });
        operation('cancel', 'update', (context, orderId, body, conditions) =>
          procurement.cancel(
            orderId,
            z
              .object({ reason: z.string().trim().min(1).max(2000) })
              .strict()
              .parse(body).reason,
            operationContext(context),
            conditions,
          ),
        );
      },
    });

    router.route('/itam/purchase-orders', routes);
    return router;
  });
