import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { AiShortcut } from '@/components/itam/ai/ai-shortcut';
import { useItamAi } from '@/lib/itam/ai-chat';

export interface QuickEntry {
  /** Translation key under `ai.quick`. */
  readonly key: string;
  readonly prompt: string;
}

/**
 * Shortcuts that open the assistant with a prepared prompt, as green text
 * (`AiShortcut`). They render nothing when no model is configured, so the
 * page keeps its plain forms.
 */
export function AiQuickEntries({
  entries,
}: {
  readonly entries: readonly QuickEntry[];
}): ReactElement | null {
  const { t } = useTranslation();
  const ai = useItamAi();
  if (!ai.available) return null;
  return (
    <div className='flex flex-wrap gap-x-4 gap-y-1'>
      {entries.map((entry) => (
        <AiShortcut key={entry.key} onClick={() => ai.ask(entry.prompt)}>
          {t(`ai.quick.${entry.key}`)}
        </AiShortcut>
      ))}
    </div>
  );
}
