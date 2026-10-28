import { useTranslation } from '@nocobase/i18n/client';
import { copyText } from '@nocobase/app-client';
import { useMutation } from '@tanstack/react-query';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import {
  useContext,
  useEffect,
  useState,
  type MouseEvent,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';

import {
  FIELD_ACTION_ICON,
  FieldActionsSlotContext,
} from '@/lib/itam/field-actions-slot';

import { Button } from '@/components/ui/button';
import { useApi } from '@/lib/itam/api';
import { ENTITLEMENTS_PATH } from '@/lib/itam/entitlements';
import { useCollectionPermissions } from '@/lib/itam/permissions';

/**
 * A key that reads as a mask until its holder asks for it: the controls sit
 * beside the value rather than in the page's actions, so a seat's own key and
 * the shared one read the same way.
 *
 * Showing and copying both hand the key to the caller, so both are the same
 * `viewKey` operation and both are audited on the server; the controls appear
 * together and the request is refused anyway without it.
 */
export function ProductKeyValue({
  entitlementId,
  seatId,
  hasKey,
}: {
  readonly entitlementId: string;
  /** A seat's own key; omitted for the entitlement's shared one. */
  readonly seatId?: string;
  readonly hasKey: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const permissions = useCollectionPermissions('entitlements', ['viewKey']);
  const [revealed, setRevealed] = useState<string | null>();
  const [copied, setCopied] = useState(false);
  // Inside a field, the controls join its hover icons at the end.
  const slot = useContext(FieldActionsSlotContext);
  const fetchKey = async () =>
    (
      await api.request<{ data: { productKey: string | null } }>({
        path: `${ENTITLEMENTS_PATH}/${entitlementId}/reveal-key`,
        method: 'POST',
        json: seatId ? { seatId } : {},
      })
    ).data.productKey;
  const reveal = useMutation({
    mutationFn: fetchKey,
    onSuccess: (key) => setRevealed(key),
  });
  const copy = useMutation({
    // Copying a key the caller has not shown is still a read of it, so it
    // goes through the same audited request.
    mutationFn: async () => {
      const key = revealed ?? (await fetchKey());
      if (!key) return { key, copied: false };
      // A browser may refuse the clipboard (no focus, no permission): then
      // the key is shown instead so it can be copied by hand.
      return { key, copied: await copyText(key) };
    },
    onSuccess: ({ key, copied: done }) => {
      if (done) {
        setCopied(true);
        return;
      }
      if (key !== null) setRevealed(key);
    },
  });
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!hasKey) return <span className='text-muted-foreground'>—</span>;

  // The cell around it opens the inline editor on a double click.
  const stop = (event: MouseEvent) => event.stopPropagation();
  const controls = permissions.viewKey ? (
    <>
      <Button
        variant='ghost'
        size='icon'
        className={slot ? FIELD_ACTION_ICON : 'size-6'}
        aria-label={
          revealed === undefined
            ? t('entitlements.revealKey')
            : t('entitlements.hideKey')
        }
        title={
          revealed === undefined
            ? t('entitlements.revealKey')
            : t('entitlements.hideKey')
        }
        disabled={reveal.isPending}
        onClick={(event: MouseEvent) => {
          event.stopPropagation();
          if (revealed === undefined) {
            reveal.mutate();
            return;
          }
          // Forgetting the value means the next look asks the server again,
          // so every reveal is one audited read.
          setRevealed(undefined);
          reveal.reset();
        }}
        onDoubleClick={stop}
      >
        {revealed === undefined ? (
          <Eye className={slot ? 'size-3' : 'size-4'} />
        ) : (
          <EyeOff className={slot ? 'size-3' : 'size-4'} />
        )}
      </Button>
      <Button
        variant='ghost'
        size='icon'
        className={slot ? FIELD_ACTION_ICON : 'size-6'}
        aria-label={copied ? t('entitlements.keyCopied') : t('actions.copy')}
        title={copied ? t('entitlements.keyCopied') : t('actions.copy')}
        disabled={copy.isPending}
        onClick={(event: MouseEvent) => {
          event.stopPropagation();
          copy.mutate();
        }}
        onDoubleClick={stop}
      >
        {/* A square glyph beside a wide, flat one: the same box reads as
            bigger, so the copy is drawn one step smaller. */}
        {copied ? (
          <Check className={slot ? 'size-3' : 'size-3.5 text-primary'} />
        ) : (
          <Copy className={slot ? 'size-3' : 'size-3.5'} />
        )}
      </Button>
    </>
  ) : null;

  return (
    <span className='inline-flex flex-wrap items-center gap-0.5'>
      {revealed === undefined ? (
        <span className='font-mono'>••••••••</span>
      ) : (
        <code className='rounded-md bg-muted px-2 py-0.5 font-mono text-xs break-all'>
          {revealed ?? '—'}
        </code>
      )}
      {slot && controls ? createPortal(controls, slot) : controls}
      {/* A failure keeps the value and its controls: it is one request that
          did not answer, not a reason to take the key away. */}
      {reveal.error || copy.error ? (
        <span className='text-xs text-destructive'>
          {t('entitlements.revealFailed')}
        </span>
      ) : null}
    </span>
  );
}
