import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import {
  BusinessRuleError,
  RecordNotFoundError,
  ValidationError,
} from './errors.js';
import type { HistoryEventRecord, HistoryService } from './history.js';
import type { ItamNotifier } from './notifier.js';
import { isFileId } from './attachments.js';

/**
 * What people write on a record's history (2026-10-14, after NocoCRM's 动态):
 * a comment, its replies, the colleagues it @-mentions and the files it
 * carries. A comment is a history event of type `comment` on the record, so
 * the timeline reads it in place among what happened, and a reply is one
 * whose payload names the comment it answers (`replyToId`, always the
 * thread's first comment). It is the one event that changes after it is
 * written: its author may edit it (`editedAt`) or delete it, which keeps the
 * line — a thread does not lose its start — and drops the text.
 */
export interface CommentFile {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
}

export interface CommentPayload {
  readonly body: string;
  /** The accounts its "@Name"s point at, by id. */
  readonly mentions: readonly string[];
  readonly files: readonly CommentFile[];
  /** The comment a reply answers. */
  readonly replyToId?: string;
  readonly editedAt?: string;
  readonly deletedAt?: string;
}

export interface CommentInput {
  readonly subjectType: string;
  readonly subjectId: string;
  readonly body: string;
  readonly mentions?: readonly string[];
  readonly fileIds?: readonly string[];
  readonly replyToId?: string;
}

/** A record a comment may be written on: how it is named and where it opens. */
interface Subject {
  /** The column the record is known by. */
  readonly label: string;
  /** Its page, under the application's base path. */
  readonly page: (row: Readonly<Record<string, unknown>>) => string;
}

const STOCK_PAGES: Readonly<Record<string, string>> = {
  accessory: 'accessories',
  consumable: 'consumables',
  component: 'components',
};

const page =
  (route: string) =>
  (row: Readonly<Record<string, unknown>>): string =>
    `/${route}/${String(row.id)}/history`;

/**
 * Every record with a history tab of its own. The keys are the collections
 * the history is written under, which are also what the route asks
 * authorization to `read`.
 */
export const COMMENT_SUBJECTS: Readonly<Record<string, Subject>> = {
  devices: { label: 'deviceNo', page: page('devices') },
  stockItems: {
    label: 'name',
    page: (row) =>
      `/${STOCK_PAGES[String(row.kind)] ?? 'accessories'}/${String(row.id)}/history`,
  },
  entitlements: { label: 'name', page: page('entitlements') },
  purchaseOrders: { label: 'orderNo', page: page('purchases') },
  repairs: { label: 'repairNo', page: page('repairs') },
  disposals: { label: 'disposalNo', page: page('disposals') },
  auditTasks: { label: 'name', page: page('audits') },
  people: { label: 'name', page: page('people') },
  models: { label: 'name', page: page('models') },
  softwareProducts: { label: 'name', page: page('software-products') },
  categories: { label: 'name', page: page('categories') },
  manufacturers: { label: 'name', page: page('manufacturers') },
  vendors: { label: 'name', page: page('vendors') },
  locations: { label: 'name', page: page('locations') },
  departments: { label: 'name', page: page('departments') },
};

/** As long as a long text may be. */
export const COMMENT_LIMIT = 5000;
/** A file is attached within the hour it was uploaded, or not at all. */
const UPLOAD_WINDOW_MS = 60 * 60 * 1000;

export interface CommentService {
  add(actorId: string, input: CommentInput): Promise<HistoryEventRecord>;
  edit(
    actorId: string,
    id: string,
    input: {
      readonly body: string;
      readonly mentions?: readonly string[];
      /** The files it keeps, of those it has; absent keeps them all. */
      readonly keepFileIds?: readonly string[];
      /** Files uploaded while editing it, joined to the kept ones. */
      readonly fileIds?: readonly string[];
    },
  ): Promise<HistoryEventRecord>;
  remove(actorId: string, id: string): Promise<void>;
  /** The record a comment is on, for the route to authorize against. */
  subjectOf(
    id: string,
  ): Promise<{ readonly subjectType: string; readonly subjectId: string }>;
}

export const commentServiceToken: ServiceToken<CommentService> =
  createServiceToken<CommentService>('itam/comment-service');

const parse = (value: unknown): unknown => {
  let current = value;
  for (let i = 0; i < 2 && typeof current === 'string'; i++) {
    try {
      current = JSON.parse(current) as unknown;
    } catch {
      return current;
    }
  }
  return current;
};

const payloadOf = (row: { payload: unknown }): CommentPayload => {
  const value = parse(row.payload);
  const record =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  return {
    body: typeof record.body === 'string' ? record.body : '',
    mentions: Array.isArray(record.mentions)
      ? record.mentions.filter((id): id is string => typeof id === 'string')
      : [],
    files: Array.isArray(record.files) ? (record.files as CommentFile[]) : [],
    ...(typeof record.replyToId === 'string'
      ? { replyToId: record.replyToId }
      : {}),
    ...(typeof record.editedAt === 'string'
      ? { editedAt: record.editedAt }
      : {}),
    ...(typeof record.deletedAt === 'string'
      ? { deletedAt: record.deletedAt }
      : {}),
  };
};

/** A column's value as text; anything else reads as nothing. */
const scalar = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

/** What the timeline's line and a notification show: one line of the text. */
const excerpt = (body: string): string => {
  const line = body.replace(/\s+/g, ' ').trim();
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
};

export function createCommentService(
  database: DatabaseManager,
  history: HistoryService,
  notifier: ItamNotifier,
): CommentService {
  const query = () => database.query();

  const subjectRow = async (
    subjectType: string,
    subjectId: string,
  ): Promise<Readonly<Record<string, unknown>>> => {
    const subject = COMMENT_SUBJECTS[subjectType];
    if (!subject)
      throw new ValidationError(
        'Comments are not kept on this record',
        'subjectType',
      );
    const row = await query()
      .selectFrom(subjectType)
      .selectAll()
      .where('id', '=', subjectId)
      .executeTakeFirst<Record<string, unknown>>();
    if (!row) throw new RecordNotFoundError(subjectType, subjectId);
    return row;
  };

  const commentRow = async (id: string) => {
    const row = await query()
      .selectFrom('historyEvents')
      .selectAll()
      .where('id', '=', id)
      .where('type', '=', 'comment')
      .executeTakeFirst<HistoryEventRecord & { payload: unknown }>();
    if (!row) throw new RecordNotFoundError('comments', id);
    return row;
  };

  // The accounts named, those that exist and are not the writer's own.
  const accounts = async (
    ids: readonly string[],
    actorId: string,
  ): Promise<string[]> => {
    const wanted = [...new Set(ids)].filter((id) => id && id !== actorId);
    if (wanted.length === 0) return [];
    const rows = await query()
      .selectFrom('user')
      .select('id')
      .where('id', 'in', wanted)
      .execute<{ id: unknown }>();
    const found = new Set(rows.map((row) => String(row.id)));
    return wanted.filter((id) => found.has(id));
  };

  // Files uploaded within the hour and attached to no record: an id alone
  // does not hand somebody else's attachment over to a comment.
  const freshFiles = async (ids: readonly string[]): Promise<CommentFile[]> => {
    const wanted = [...new Set(ids)];
    if (wanted.length === 0) return [];
    if (!wanted.every(isFileId))
      throw new ValidationError('A file is not available to attach', 'fileIds');
    const found = await query()
      .selectFrom('itamFiles')
      .select(['id', 'filename', 'ext', 'mimeType', 'size'])
      .where('id', 'in', wanted)
      // The file plugin stamps its rows in UTC without the `Z`.
      .where(
        'createdAt',
        '>=',
        new Date(Date.now() - UPLOAD_WINDOW_MS).toISOString().slice(0, -1),
      )
      .execute<{
        id: unknown;
        filename: unknown;
        ext: unknown;
        mimeType: unknown;
        size: unknown;
      }>();
    // Those on a record already, asked apart: a link's file id is text and
    // the file's a UUID, which PostgreSQL does not compare (2026-10-25).
    const linked = new Set(
      (
        await query()
          .selectFrom('attachmentLinks')
          .select('fileId')
          .where('fileId', 'in', wanted)
          .execute<{ fileId: unknown }>()
      ).map((row) => String(row.fileId)),
    );
    const rows = found.filter((row) => !linked.has(String(row.id)));
    if (rows.length !== wanted.length)
      throw new ValidationError('A file is not available to attach', 'fileIds');
    const byId = new Map(rows.map((row) => [String(row.id), row]));
    return wanted.map((id) => {
      const row = byId.get(id)!;
      return {
        id,
        filename: String(row.filename),
        ext: String(row.ext),
        mimeType: String(row.mimeType),
        size: Number(row.size),
      };
    });
  };

  const bodyOf = (body: string, files: number): string => {
    const text = body.trim();
    if (!text && files === 0)
      throw new ValidationError('Write something', 'body');
    if (text.length > COMMENT_LIMIT)
      throw new ValidationError('The comment is too long', 'body');
    return text;
  };

  // Tells the people a comment is for: whoever it mentions, and on a reply,
  // whoever already wrote in the thread. Each is told once, never the
  // writer; a failed delivery never fails the comment.
  const tell = async (
    actorId: string,
    comment: { id: string; subjectType: string; subjectId: string },
    body: string,
    mentioned: readonly string[],
    thread: readonly string[],
  ): Promise<void> => {
    if (mentioned.length === 0 && thread.length === 0) return;
    const row = await subjectRow(comment.subjectType, comment.subjectId);
    const subject = COMMENT_SUBJECTS[comment.subjectType];
    const title = scalar(row[subject.label]);
    const actor = await query()
      .selectFrom('user')
      .select(['name', 'username'])
      .where('id', '=', actorId)
      .executeTakeFirst<{ name: unknown; username: unknown }>();
    const actorName =
      typeof actor?.name === 'string' && actor.name
        ? actor.name
        : scalar(actor?.username);
    const url = `${subject.page(row)}?focus=${comment.id}`;
    const source = {
      type: comment.subjectType,
      referenceId: comment.subjectId,
    };
    const text = excerpt(body);
    if (mentioned.length > 0)
      await notifier.notify({
        key: `comment:${comment.id}:mentioned`,
        to: mentioned,
        actorId,
        title: {
          key: 'notifications.commentMentioned',
          params: { actor: actorName, title },
        },
        body: { text },
        url,
        source,
      });
    const replied = thread.filter((id) => !mentioned.includes(id));
    if (replied.length > 0)
      await notifier.notify({
        key: `comment:${comment.id}:replied`,
        to: replied,
        actorId,
        title: {
          key: 'notifications.commentReplied',
          params: { actor: actorName, title },
        },
        body: { text },
        url,
        source,
      });
  };

  return {
    async add(actorId, input) {
      await subjectRow(input.subjectType, input.subjectId);
      const files = await freshFiles(input.fileIds ?? []);
      const body = bodyOf(input.body, files.length);
      const mentions = await accounts(input.mentions ?? [], actorId);
      // A reply answers the thread's first comment, on the same record; a
      // reply to a reply joins the same thread.
      let replyToId: string | undefined;
      let thread: string[] = [];
      if (input.replyToId) {
        const parent = await commentRow(input.replyToId);
        if (
          parent.subjectType !== input.subjectType ||
          parent.subjectId !== input.subjectId
        )
          throw new ValidationError(
            'That comment is on another record',
            'replyToId',
          );
        replyToId = payloadOf(parent).replyToId ?? parent.id;
        const replies = await query()
          .selectFrom('historyEvents')
          .select(['actorId', 'payload'])
          .where('subjectType', '=', input.subjectType)
          .where('subjectId', '=', input.subjectId)
          .where('type', '=', 'comment')
          .execute<{ actorId: unknown; payload: unknown }>();
        const root =
          replyToId === parent.id ? parent : await commentRow(replyToId);
        thread = [
          ...new Set(
            [
              root.actorId,
              ...replies
                .filter((reply) => payloadOf(reply).replyToId === replyToId)
                .map((reply) => reply.actorId),
            ].filter(
              (id): id is string => typeof id === 'string' && id !== actorId,
            ),
          ),
        ];
      }
      const payload: CommentPayload = {
        body,
        mentions,
        files,
        ...(replyToId ? { replyToId } : {}),
      };
      const id = await history.record({
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        type: 'comment',
        summary: excerpt(body),
        payload: { ...payload },
        actorId,
      });
      await tell(
        actorId,
        { id, subjectType: input.subjectType, subjectId: input.subjectId },
        body,
        mentions,
        thread,
      );
      return { ...(await commentRow(id)), payload: { ...payload } };
    },

    async edit(actorId, id, input) {
      const row = await commentRow(id);
      if (row.actorId !== actorId)
        throw new BusinessRuleError(
          'Only its author may change a comment',
          'NOT_AUTHOR',
        );
      const before = payloadOf(row);
      if (before.deletedAt)
        throw new BusinessRuleError(
          'The comment was deleted',
          'COMMENT_DELETED',
        );
      // Its author may take a file off it, and add files just uploaded,
      // held to the same rules as a new comment's (2026-10-16).
      const kept = input.keepFileIds
        ? before.files.filter((file) => input.keepFileIds?.includes(file.id))
        : before.files;
      const files = [...kept, ...(await freshFiles(input.fileIds ?? []))];
      const body = bodyOf(input.body, files.length);
      const mentions = await accounts(input.mentions ?? [], actorId);
      const payload: CommentPayload = {
        ...before,
        files,
        body,
        mentions,
        editedAt: new Date().toISOString(),
      };
      await query()
        .updateTable('historyEvents')
        .set({ payload: { ...payload }, summary: excerpt(body) })
        .where('id', '=', id)
        .execute();
      // Only whoever the edit newly mentions is told.
      await tell(
        actorId,
        { id, subjectType: row.subjectType, subjectId: row.subjectId },
        body,
        mentions.filter((mention) => !before.mentions.includes(mention)),
        [],
      );
      return { ...row, payload: { ...payload }, summary: excerpt(body) };
    },

    async remove(actorId, id) {
      const row = await commentRow(id);
      if (row.actorId !== actorId)
        throw new BusinessRuleError(
          'Only its author may delete a comment',
          'NOT_AUTHOR',
        );
      const before = payloadOf(row);
      // The line stays, so a thread keeps its start; what it said goes.
      await query()
        .updateTable('historyEvents')
        .set({
          summary: '',
          payload: {
            body: '',
            mentions: [],
            files: [],
            ...(before.replyToId ? { replyToId: before.replyToId } : {}),
            deletedAt: new Date().toISOString(),
          },
        })
        .where('id', '=', id)
        .execute();
    },

    async subjectOf(id) {
      const row = await commentRow(id);
      return { subjectType: row.subjectType, subjectId: row.subjectId };
    },
  };
}
