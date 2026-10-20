import { useService } from '@nocobase/app-client';
import {
  clientFileRepositoryManagerToken,
  type FileRecord,
} from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import { ImageIcon, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

import { ConfirmDialog } from './confirm-dialog.js';
import { errorMessage } from '@/lib/itam/format';
import { IMAGE_REPOSITORY, useRecordImageUrl } from '@/lib/itam/images';
import { cn } from '@/lib/utils';

/** The full-size picture in a dialog, with its credit. */
function PictureLightbox({
  src,
  alt,
  credit,
  open,
  onOpenChange,
}: {
  readonly src: string;
  readonly alt: string;
  readonly credit?: string | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    // The dialog renders in a portal, but React events still bubble to the
    // element that opened it; the wrapper keeps a click on the overlay from
    // also reaching a list row's own click handler.
    <span onClick={(event) => event.stopPropagation()}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className='max-w-3xl p-2 sm:max-w-3xl'>
          <DialogTitle className='sr-only'>
            {alt || t('image.view')}
          </DialogTitle>
          <img
            src={src}
            alt={alt}
            className='max-h-[80vh] w-full rounded-md object-contain'
          />
          {credit ? (
            <p className='text-center text-xs text-muted-foreground'>
              {credit}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </span>
  );
}

/**
 * A record's picture from the file store, else a placeholder. Clicking the
 * picture opens it full size. Editable pictures upload on click and can be removed.
 */
export function RecordImage({
  fileId,
  alt,
  credit,
  editable = false,
  onChange,
  className,
}: {
  readonly fileId: string | null | undefined;
  readonly alt: string;
  /** Attribution shown under the picture, e.g. a Creative Commons credit. */
  readonly credit?: string | null;
  readonly editable?: boolean;
  /** Called with the uploaded file, or `null` to remove the picture. */
  readonly onChange?: (file: FileRecord | null) => Promise<void>;
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation();
  const manager = useService(clientFileRepositoryManagerToken);
  const repository = useMemo(
    () => manager.repository(IMAGE_REPOSITORY),
    [manager],
  );
  const src = useRecordImageUrl(fileId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();

  const upload = async (file: File | undefined) => {
    if (!file || !onChange) return;
    setBusy(true);
    setError(undefined);
    try {
      const { record } = await repository.uploadOne({ file });
      await onChange(record);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!onChange) return;
    setBusy(true);
    setError(undefined);
    try {
      await onChange(null);
      setConfirming(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('space-y-1', className)}>
      <div className='group/image relative aspect-4/3 w-full overflow-hidden rounded-md border border-border bg-muted/40'>
        {src ? (
          <button
            type='button'
            className='block size-full cursor-zoom-in focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'
            title={t('image.view')}
            aria-label={t('image.view')}
            onClick={() => setViewing(true)}
          >
            <img src={src} alt={alt} className='size-full object-contain p-2' />
          </button>
        ) : (
          <div className='flex size-full items-center justify-center text-muted-foreground'>
            <ImageIcon className='size-8' aria-hidden='true' />
          </div>
        )}
        {editable ? (
          <div className='absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-linear-to-t from-background/90 to-transparent p-1.5 opacity-0 transition-opacity group-hover/image:opacity-100 focus-within:opacity-100'>
            <Button
              type='button'
              variant='secondary'
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <Upload />
              {src ? t('image.replace') : t('image.upload')}
            </Button>
            {src ? (
              <Button
                type='button'
                variant='secondary'
                disabled={busy}
                aria-label={t('image.remove')}
                title={t('image.remove')}
                onClick={() => setConfirming(true)}
              >
                <Trash2 />
              </Button>
            ) : null}
            <input
              ref={inputRef}
              type='file'
              accept='image/*'
              className='hidden'
              onChange={(event) => {
                void upload(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </div>
        ) : null}
      </div>
      {src && credit ? (
        <p className='text-center text-xs text-muted-foreground'>{credit}</p>
      ) : null}
      {error ? <p className='text-xs text-destructive'>{error}</p> : null}
      {src ? (
        <PictureLightbox
          src={src}
          alt={alt}
          credit={credit}
          open={viewing}
          onOpenChange={setViewing}
        />
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => !open && setConfirming(false)}
        title={t('image.removeTitle')}
        description={t('image.removeDescription')}
        destructive
        busy={busy}
        confirmLabel={t('image.remove')}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

/**
 * A small picture for list rows; clicking it opens the full-size picture.
 * A placeholder when there is none.
 */
export function RecordThumbnail({
  fileId,
  alt,
  credit,
}: {
  readonly fileId: string | null | undefined;
  readonly alt: string;
  readonly credit?: string | null;
}): ReactElement {
  const { t } = useTranslation();
  const src = useRecordImageUrl(fileId);
  const [open, setOpen] = useState(false);
  const frame =
    'mr-2 inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted/40 align-middle';
  if (!src)
    return (
      <span className={frame}>
        <ImageIcon
          className='size-4 text-muted-foreground'
          aria-hidden='true'
        />
      </span>
    );
  return (
    <>
      <button
        type='button'
        className={cn(
          frame,
          'cursor-zoom-in transition-colors hover:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
        )}
        title={t('image.view')}
        aria-label={t('image.view')}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <img src={src} alt={alt} className='size-full object-contain p-0.5' />
      </button>
      <PictureLightbox
        src={src}
        alt={alt}
        credit={credit}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
