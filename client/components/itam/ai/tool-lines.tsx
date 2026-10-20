import type { AIToolRendererProps } from '@nocobase/app-plugin-agents/client/chat';
import { useTranslation } from '@nocobase/i18n/client';
import { CircleAlert, Globe, Search } from 'lucide-react';
import type { ReactElement } from 'react';

import { Spinner } from '#components/ui/spinner';

/** What a refused call says: the tool's own `{ error }`, else the chat's. */
function refusal(part: AIToolRendererProps['part']): string | null {
  if (part.state === 'output-error') return part.errorText;
  if (part.state !== 'output-available') return null;
  const output = part.output as { error?: { message?: unknown } } | null;
  const message = output?.error?.message;
  return typeof message === 'string' ? message : null;
}

/** What a web tool was asked: its query or page, as its public input gives it. */
function asked(part: AIToolRendererProps['part']): string | null {
  const input = part.input as { query?: unknown; url?: unknown } | undefined;
  const value = input?.query ?? input?.url;
  return typeof value === 'string' && value ? value : null;
}

/**
 * One of Asset Steward's tool calls as a quiet line in a conversation: what
 * it looked at — for the web, the query or the page — a spinner while it
 * runs, the reason when it was refused (`lib/itam/tool-renderers.ts`).
 */
export function ToolLine({
  toolName,
  part,
}: AIToolRendererProps): ReactElement {
  const { t } = useTranslation();
  const done =
    part.state === 'output-available' ||
    part.state === 'output-error' ||
    part.state === 'output-denied';
  const error = refusal(part);
  const detail = asked(part);
  return (
    <p className='my-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground'>
      {!done ? (
        <Spinner className='size-3.5' />
      ) : error ? (
        <CircleAlert className='size-3.5 shrink-0 text-destructive' />
      ) : toolName.startsWith('itam_web_') ? (
        <Globe className='size-3.5 shrink-0' />
      ) : (
        <Search className='size-3.5 shrink-0' />
      )}
      <span className='shrink-0'>{t(`ai.tools.${toolName}`)}</span>
      {detail && !error ? (
        <span className='min-w-0 truncate' title={detail}>
          {detail}
        </span>
      ) : null}
      {error ? (
        <span className='min-w-0 truncate text-destructive' title={error}>
          {error}
        </span>
      ) : null}
    </p>
  );
}
