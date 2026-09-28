import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiErrorBody } from '@/lib/itam/api';
import { errorMessage } from '@/lib/itam/format';
import { cn } from '@/lib/utils';

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly children?: ReactNode;
  readonly busy?: boolean;
  readonly error?: unknown;
  readonly disabled?: boolean;
  /** Blocks only the main action; the secondary one (a draft) stays open. */
  readonly confirmDisabled?: boolean;
  readonly confirmLabel?: ReactNode;
  readonly destructive?: boolean;
  readonly onConfirm: () => void;
  /** A second, less prominent way to finish (e.g. save a draft, reject). */
  readonly secondaryLabel?: ReactNode;
  readonly onSecondary?: () => void;
  /**
   * Marks the second action as the negative outcome (rejecting an approval).
   * It stays an outline button — two filled buttons beside each other read as
   * two main actions — and only its label carries the destructive colour.
   */
  readonly secondaryDestructive?: boolean;
  /** `wide` for a form that carries a table, such as an order's lines. */
  readonly size?: 'default' | 'wide';
}

/** A small dialog with optional inputs and one confirming action. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  busy,
  error,
  disabled,
  confirmDisabled,
  confirmLabel,
  destructive,
  onConfirm,
  secondaryLabel,
  onSecondary,
  secondaryDestructive,
  size = 'default',
}: ConfirmDialogProps): ReactElement {
  const { t } = useTranslation();
  const message = error
    ? (apiErrorBody(error)?.message ?? errorMessage(error))
    : undefined;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (!busy ? onOpenChange(next) : undefined)}
    >
      {/* A dialog that asks for more than a sentence can outgrow a short
          window — the disposal's create form does — so it scrolls at the
          same height the record form dialog uses. */}
      <DialogContent
        className={cn(
          'max-h-[90svh] overflow-y-auto',
          size === 'wide' ? 'sm:max-w-3xl' : 'sm:max-w-md',
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {children ? <div className='grid gap-3'>{children}</div> : null}
        {message ? <p className='text-sm text-destructive'>{message}</p> : null}
        <DialogFooter>
          <Button
            variant='outline'
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t('actions.cancel')}
          </Button>
          {onSecondary ? (
            <Button
              variant='outline'
              className={
                secondaryDestructive
                  ? 'text-destructive hover:text-destructive'
                  : undefined
              }
              disabled={busy || disabled}
              onClick={onSecondary}
            >
              {secondaryLabel}
            </Button>
          ) : null}
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={busy || disabled || confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel ?? t('actions.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
