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
  readonly files: readonly LinkedFile[];
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
