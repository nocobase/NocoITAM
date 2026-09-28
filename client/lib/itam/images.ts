import { useService } from '@nocobase/app-client';
import { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file/client';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

/** The repository model and stock pictures are uploaded to. */
export const IMAGE_REPOSITORY = 'itamAttachments';

/** The URL a record picture renders from, resolved through the file store. */
export function useRecordImageUrl(
  fileId: string | null | undefined,
): string | undefined {
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository(IMAGE_REPOSITORY),
    [manager],
  );
  const file = useQuery({
    queryKey: ['itam', 'file', fileId],
    queryFn: async () =>
      (await repository.findOne({ filter: { id: fileId } })) ?? null,
    enabled: Boolean(fileId),
    staleTime: 5 * 60 * 1000,
  });
  return fileId ? file.data?.contentUrl : undefined;
}
