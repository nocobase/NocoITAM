import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import { decodeRow, type Row } from './collection-query.js';
import { RecordNotFoundError, ValidationError } from './errors.js';
import type { HistoryService } from './history.js';
import type { OperationContext } from './devices.js';

/**
 * Links between uploaded files (`itamFiles`, managed by the file plugin) and
 * business records. A record's attachment tab shows only the files linked
 * to that record; an order's files stay on the order.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether `id` can be an uploaded file's (2026-10-25): the file plugin's ids
 * are UUIDs, held in a UUID column on PostgreSQL, which refuses any other
 * text outright where SQLite and MySQL found no row. An id from a request is
 * checked first, so it is not found rather than an error.
 */
export function isFileId(id: string): boolean {
  return UUID.test(id);
}

export const ATTACHMENT_OWNER_TYPES = [
  'devices',
  'stockItems',
  'entitlements',
  'purchaseOrders',
  'repairs',
  'disposals',
  'auditTasks',
  'vendors',
  'models',
] as const;
export type AttachmentOwnerType = (typeof ATTACHMENT_OWNER_TYPES)[number];

export interface AttachmentGroup {
  readonly ownerType: string;
  readonly ownerId: string;
  /** Display label of the related record; empty for the record itself. */
  readonly ownerLabel?: string;
  /** `comments`: the files the record's comments carry, not its own. */
  readonly source?: 'comments';
  readonly files: readonly Row[];
}

export interface AttachmentService {
  link(
    ownerType: AttachmentOwnerType,
    ownerId: string,
    fileIds: readonly string[],
    context: OperationContext,
  ): Promise<readonly Row[]>;
  unlink(linkId: string, context: OperationContext): Promise<void>;
  /**
   * The record's own files, then — as a group of their own — the files its
   * comments carry, so the tab lists every file the record holds.
   */
  grouped(
    ownerType: AttachmentOwnerType,
    ownerId: string,
  ): Promise<readonly AttachmentGroup[]>;
  countFor(ownerType: AttachmentOwnerType, ownerId: string): Promise<number>;
}

export const attachmentServiceToken: ServiceToken<AttachmentService> =
  createServiceToken<AttachmentService>('itam/attachment-service');

export function createAttachmentService(
  database: DatabaseManager,
  history: HistoryService,
): AttachmentService {
  const filesFor = async (links: readonly Row[]): Promise<Row[]> => {
    if (links.length === 0) return [];
    const ids = [...new Set(links.map((link) => String(link.fileId)))];
    const files = await database
      .query()
      .selectFrom('itamFiles')
      .selectAll()
      .where('id', 'in', ids)
      .execute<Row>();
    const byId = new Map(
      files.map((file) => [String(file.id), decodeRow(file)]),
    );
    return links.flatMap((link) => {
      const file = byId.get(String(link.fileId));
      return file
        ? [
            {
              ...file,
              linkId: link.id,
              uploadedById: link.uploadedById,
              linkedAt: link.createdAt,
            },
          ]
        : [];
    });
  };

  const linksOf = async (ownerType: string, ownerId: string): Promise<Row[]> =>
    (
      await database
        .query()
        .selectFrom('attachmentLinks')
        .selectAll()
        .where('ownerType', '=', ownerType)
        .where('ownerId', '=', ownerId)
        .orderBy('createdAt', 'desc')
        .execute<Row>()
    ).map((row) => decodeRow(row));

  return {
    async link(ownerType, ownerId, fileIds, context) {
      if (fileIds.length === 0)
        throw new ValidationError('fileIds is required', 'fileIds');
      const candidates = fileIds.filter(isFileId);
      const files = candidates.length
        ? await database
            .query()
            .selectFrom('itamFiles')
            .select(['id', 'filename'])
            .where('id', 'in', candidates)
            .execute<{ id: string; filename: string }>()
        : [];
      const known = new Set(files.map((file) => file.id));
      const nameOf = new Map(files.map((file) => [file.id, file.filename]));
      const missing = fileIds.filter((id) => !known.has(id));
      if (missing.length > 0)
        throw new ValidationError(
          `Unknown files: ${missing.join(', ')}`,
          'fileIds',
        );
      await database.transaction(async (connection) => {
        for (const fileId of fileIds) {
          const existing = await connection.query
            .selectFrom('attachmentLinks')
            .select('id')
            .where('fileId', '=', fileId)
            .where('ownerType', '=', ownerType)
            .where('ownerId', '=', ownerId)
            .executeTakeFirst();
          if (existing) continue;
          await connection.query
            .insertInto('attachmentLinks')
            .values({
              id: crypto.randomUUID(),
              fileId,
              ownerType,
              ownerId,
              uploadedById: context.actorId,
              createdAt: new Date(),
            })
            .execute();
          // Attaching a file is something someone did, not a field that
          // took a new value: it reads as an event, beside the operations it
          // usually accompanies (a receipt, a repair report).
          await history.record(
            {
              subjectType: ownerType,
              subjectId: ownerId,
              type: 'attachmentAdded',
              summary: `Attached ${nameOf.get(fileId) ?? fileId}`,
              payload: { fileId, filename: nameOf.get(fileId) ?? fileId },
              ...context,
            },
            connection,
          );
        }
      });
      return filesFor(await linksOf(ownerType, ownerId));
    },

    async unlink(linkId, context) {
      const link = await database
        .query()
        .selectFrom('attachmentLinks')
        .selectAll()
        .where('id', '=', linkId)
        .executeTakeFirst<Row>();
      if (!link) throw new RecordNotFoundError('attachmentLinks', linkId);
      const file = await database
        .query()
        .selectFrom('itamFiles')
        .select('filename')
        .where('id', '=', String(link.fileId))
        .executeTakeFirst<{ filename: string }>();
      await database.transaction(async (connection) => {
        await connection.query
          .deleteFrom('attachmentLinks')
          .where('id', '=', linkId)
          .execute();
        await history.record(
          {
            subjectType: String(link.ownerType),
            subjectId: String(link.ownerId),
            type: 'attachmentRemoved',
            summary: `Removed ${file?.filename ?? String(link.fileId)}`,
            payload: {
              fileId: link.fileId,
              filename: file?.filename ?? String(link.fileId),
            },
            ...context,
          },
          connection,
        );
      });
    },

    async grouped(ownerType, ownerId) {
      // Only what was attached to this record: files on a related record
      // (its order) stay on that record's own tab. A comment's files are
      // the record's too (2026-10-16): they follow, in a group of their
      // own, newest first, each named by who wrote the comment and when —
      // a deleted comment takes its files with it.
      const comments = await database
        .query()
        .selectFrom('historyEvents')
        .select(['id', 'actorId', 'createdAt', 'payload'])
        .where('subjectType', '=', ownerType)
        .where('subjectId', '=', ownerId)
        .where('type', '=', 'comment')
        .orderBy('createdAt', 'desc')
        .execute<Row>();
      const commentFiles = comments.flatMap((row) => {
        const payload = (
          typeof row.payload === 'string'
            ? (JSON.parse(row.payload) as unknown)
            : row.payload
        ) as { files?: unknown } | null;
        const files = Array.isArray(payload?.files)
          ? (payload.files as Row[])
          : [];
        return files.map((file) => ({
          ...file,
          linkId: `comment:${String(row.id)}:${String(file.id)}`,
          commentId: row.id,
          uploadedById: row.actorId,
          linkedAt: decodeRow(row).createdAt,
        }));
      });
      return [
        {
          ownerType,
          ownerId,
          files: await filesFor(await linksOf(ownerType, ownerId)),
        },
        ...(commentFiles.length
          ? [
              {
                ownerType,
                ownerId,
                source: 'comments' as const,
                files: commentFiles,
              },
            ]
          : []),
      ];
    },

    async countFor(ownerType, ownerId) {
      const row = await database
        .query()
        .selectFrom('attachmentLinks')
        .select((eb) => [eb.fn.countAll().as('total')])
        .where('ownerType', '=', ownerType)
        .where('ownerId', '=', ownerId)
        .executeTakeFirst<{ total: number | string }>();
      return Number(row?.total ?? 0);
    },
  };
}
