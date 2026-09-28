import { useService } from '@nocobase/app-client';
import {
  clientFileRepositoryManagerToken,
  type FileRecord,
} from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, useState, type ReactElement } from 'react';

import { FileUploadField } from '@/extensions/nocobase-file-component-ui';
import { Label } from '@/components/ui/label';

/**
 * Files chosen while a record is still being created: uploaded at once,
 * handed back as records to link once the record exists. `onBusy` says
 * whether an upload is still in flight, so the form can wait for it.
 */
export function AttachmentsUpload({
  value,
  onChange,
  onBusy,
}: {
  readonly value: readonly FileRecord[];
  readonly onChange: (files: readonly FileRecord[]) => void;
  readonly onBusy?: (busy: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository('itamAttachments'),
    [manager],
  );
  const [error, setError] = useState<string>();
  return (
    <div className='grid gap-1.5'>
      <Label>{t('attachments.optional')}</Label>
      <FileUploadField
        repository={repository}
        value={value}
        onChange={(files) => {
          setError(undefined);
          onChange(files);
        }}
        multiple
        onStatusChange={(status) => onBusy?.(status === 'uploading')}
        onError={(failure) => setError(failure.message)}
        labels={{
          choose: t('attachments.upload'),
          remove: t('actions.delete'),
          retry: t('attachments.retry'),
        }}
      />
      {error ? <p className='text-xs text-destructive'>{error}</p> : null}
    </div>
  );
}
