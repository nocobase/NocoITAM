import { useState, type ReactElement, type ReactNode } from 'react';

import { ConfirmDialog } from '@/components/itam/confirm-dialog';

export interface ConfirmRequest {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Extra content under the description, e.g. the record it applies to. */
  readonly body?: ReactNode;
  readonly confirmLabel?: ReactNode;
  readonly destructive?: boolean;
  /** Runs on confirm; the dialog stays open with the error if it throws. */
  readonly action: () => Promise<unknown>;
}

/**
 * A second confirmation before an operation that changes data. \`ask\` opens
 * the shared confirm dialog; render \`dialog\` once in the component. The
 * operation runs on confirm, the dialog shows its progress and, if it
 * fails, its error.
 */
export function useConfirm(): {
  readonly ask: (request: ConfirmRequest) => void;
  readonly dialog: ReactElement | null;
} {
  const [request, setRequest] = useState<ConfirmRequest>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const ask = (next: ConfirmRequest) => {
    setError(undefined);
    setRequest(next);
  };
  const dialog = request ? (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) setRequest(undefined);
      }}
      title={request.title}
      description={request.description}
      confirmLabel={request.confirmLabel}
      destructive={request.destructive}
      busy={busy}
      error={error}
      onConfirm={() => {
        setBusy(true);
        setError(undefined);
        request
          .action()
          .then(() => setRequest(undefined))
          .catch((failure: unknown) => setError(failure))
          .finally(() => setBusy(false));
      }}
    >
      {request.body}
    </ConfirmDialog>
  ) : null;
  return { ask, dialog };
}
