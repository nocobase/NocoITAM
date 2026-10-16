import { useService } from '@nocobase/app-client';
import {
  clientFileRepositoryManagerToken,
  type FileRecord,
} from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';

import {
  FilePreviewDialog,
  FileUploadField,
} from '@/extensions/nocobase-file-component-ui';
import { EmptyState } from '@/components/itam/empty-state';
import { FileRows } from '@/components/itam/file-cards';
import { Paged } from '@/components/itam/paged';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/lib/itam/api';
import { useAttachmentGroups } from '@/lib/itam/attachments';
import { errorMessage } from '@/lib/itam/format';
import { useCollectionPermissions } from '@/lib/itam/permissions';

import { useReferenceNames } from '@/lib/itam/references';
import { useConfirm } from '@/lib/itam/use-confirm';

/**
 * Attachments of one record, grouped: its own files first, then files from
 * related records. Uploads go to the ITAM file repository, then get linked
 * to the record in a second request.
 */
/** A file's size reads as bytes, KB or MB; the file plugin may send it as text. */
export function AttachmentsTab({
  ownerType,
  ownerId,
}: {
  readonly ownerType: string;
  readonly ownerId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository('itamAttachments'),
    [manager],
  );
  const permissions = useCollectionPermissions(ownerType, ['update']);
  const [pending, setPending] = useState<readonly FileRecord[]>([]);
  const [uploadError, setUploadError] = useState<string>();
  const [preview, setPreview] = useState<{
    files: readonly FileRecord[];
    index: number;
  }>();
  const key = ['itam', 'attachments', ownerType, ownerId];
  const groups = useAttachmentGroups(ownerType, ownerId);
  const noFiles = Boolean(
    groups.data && groups.data.every((group) => group.files.length === 0),
  );
  const names = useReferenceNames([
    {
      collection: 'users',
      ids:
        groups.data?.flatMap((group) =>
          group.files.map((file) => file.uploadedById),
        ) ?? [],
    },
  ]);
  const link = useMutation({
    mutationFn: async (files: readonly FileRecord[]) =>
      api.request({
        path: `itam/attachments/${ownerType}/${ownerId}`,
        method: 'POST',
        json: { fileIds: files.map((file) => file.id) },
      }),
    onSuccess: async () => {
      setPending([]);
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const unlink = useMutation({
    mutationFn: async (linkId: string) =>
      api.request({
        path: `itam/attachments/links/${linkId}`,
        method: 'DELETE',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const confirm = useConfirm();

  return (
    <div className='space-y-5'>
      {confirm.dialog}
      {permissions.update ? (
        <div className='space-y-2'>
          <FileUploadField
            repository={repository}
            value={pending}
            onChange={(files) => {
              setUploadError(undefined);
              setPending(files);
              if (files.length > pending.length)
                link.mutate(
                  files.filter(
                    (file) =>
                      !pending.some((existing) => existing.id === file.id),
                  ),
                );
            }}
            multiple
            // With no files yet, the drop zone is the whole empty state;
            // above existing files it shrinks to one line.
            placeholder={
              noFiles ? (
                <div className='flex flex-col items-center gap-1 text-sm text-muted-foreground'>
                  <Paperclip className='mb-1 size-6' aria-hidden='true' />
                  <p className='font-medium text-foreground'>
                    {t('attachments.empty')}
                  </p>
                  <p>{t('attachments.dropHint')}</p>
                </div>
              ) : (
                <span className='text-muted-foreground'>
                  {t('attachments.dropInline')}
                </span>
              )
            }
            placeholderLayout={noFiles ? 'stack' : 'inline'}
            onError={(error) => setUploadError(error.message)}
            labels={{
              choose: t('attachments.upload'),
              empty: t('attachments.dropHere'),
              remove: t('actions.delete'),
              retry: t('attachments.retry'),
            }}
          />
          {uploadError || link.error ? (
            <p role='alert' className='text-sm text-destructive'>
              {uploadError ?? errorMessage(link.error)}
            </p>
          ) : null}
        </div>
      ) : null}
      {groups.isLoading ? (
        <div aria-label={t('common.loading')} className='space-y-3'>
          <Skeleton className='h-5 w-28' />
          <Skeleton className='h-16 w-full' />
          <Skeleton className='h-16 w-full' />
        </div>
      ) : null}
      {groups.error || unlink.error ? (
        <p
          role='alert'
          className='rounded-md bg-destructive/10 p-3 text-sm text-destructive'
        >
          {errorMessage(groups.error ?? unlink.error)}
        </p>
      ) : null}
      {groups.data?.map((group) => (
        <section
          key={`${group.ownerType}:${group.ownerId}`}
          className='space-y-2'
        >
          {group.files.length === 0 ? (
            // Someone who may upload already sees the drop zone saying so.
            permissions.update ? null : (
              <EmptyState
                icon={<Paperclip aria-hidden='true' />}
                title={t('attachments.empty')}
              />
            )
          ) : (
            <Paged rows={group.files}>
              {(pageRows) => (
                <FileRows
                  files={pageRows.map((file) => ({
                    id: file.linkId,
                    filename: file.filename,
                    mimeType: file.mimeType,
                    size: file.size,
                    url: file.contentUrl,
                    date: file.linkedAt,
                  }))}
                  onOpen={(_card, fileIndex) =>
                    setPreview({
                      files: group.files,
                      index: group.files.indexOf(pageRows[fileIndex]),
                    })
                  }
                  detail={(card) => {
                    const by = pageRows.find(
                      (file) => file.linkId === card.id,
                    )?.uploadedById;
                    return by ? names.users?.get(by) : undefined;
                  }}
                  onRemove={
                    permissions.update
                      ? (card) =>
                          confirm.ask({
                            title: t('actions.delete'),
                            description: t('confirmations.removeAttachment', {
                              name: card.filename,
                            }),
                            confirmLabel: t('actions.delete'),
                            destructive: true,
                            action: () => unlink.mutateAsync(card.id),
                          })
                      : undefined
                  }
                />
              )}
            </Paged>
          )}
        </section>
      ))}
      {preview ? (
        <FilePreviewDialog
          files={preview.files}
          initialIndex={preview.index}
          open
          onOpenChange={(open) => !open && setPreview(undefined)}
          download
        />
      ) : null}
    </div>
  );
}
