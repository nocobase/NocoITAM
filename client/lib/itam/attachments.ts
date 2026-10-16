import type { FileRecord } from '@nocobase/app-plugin-file/client';
import { useQuery } from '@tanstack/react-query';
import { useApi } from './api.js';

interface LinkedFile extends FileRecord {
  readonly linkId: string;
  readonly uploadedById: string | null;
  readonly linkedAt: string;
}

export interface AttachmentGroup {
  readonly ownerType: string;
  readonly ownerId: string;
  readonly ownerLabel?: string;
  /** `comments`: the files the record's comments carry, not its own. */
  readonly source?: 'comments';
  readonly files: readonly LinkedFile[];
}

/**
 * The largest file one upload takes: the `itamAttachments` exposure's
 * `uploadOne` limit in `server/routes/itam/attachments.ts`. A larger file is
 * refused in the page, before it is sent, with a message saying so.
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = '20 MB';

/** Why a file could not be uploaded, in the reader's language. */
export function uploadFailure(
  t: (key: string, options?: Record<string, unknown>) => string,
  name: string,
  error?: unknown,
): string {
  const message = error instanceof Error ? error.message : '';
  return error === undefined || /too large/i.test(message)
    ? t('attachments.tooLarge', { name, max: MAX_UPLOAD_LABEL })
    : t('attachments.uploadFailed', { name, reason: message });
}

/** Shared by the tab label and its contents, so uploads refresh both together. */
export function useAttachmentGroups(
  ownerType: string,
  ownerId: string | undefined,
) {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', 'attachments', ownerType, ownerId],
    enabled: Boolean(ownerId),
    queryFn: async () =>
      (
        await api.request<{ data: AttachmentGroup[] }>({
          path: `itam/attachments/${ownerType}/${ownerId}`,
        })
      ).data,
  });
}

export function attachmentCount(
  groups: readonly AttachmentGroup[] | undefined,
): number | undefined {
  return groups?.reduce((count, group) => count + group.files.length, 0);
}
