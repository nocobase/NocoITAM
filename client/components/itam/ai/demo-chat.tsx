import { useTranslation } from '@nocobase/i18n/client';
import type { ChatInputAvailability } from '#extensions/nocobase-agent-chat/input-availability';

import { useDemoMode } from '@/lib/itam/demo-mode';

/**
 * The chat's composers on a Demo Mode deployment (2026-10-25): it refuses
 * every write, a new message's too, so nothing can be sent and the composer
 * says why; the conversations the demo comes with stay readable. Elsewhere,
 * undefined: the composers decide as they always do.
 */
export function useDemoChatInput(): ChatInputAvailability | undefined {
  const { t } = useTranslation();
  const demo = useDemoMode();
  if (demo.data !== true) return undefined;
  return {
    canSend: false,
    notice: (
      <p className='text-xs text-muted-foreground'>{t('ai.demoReadOnly')}</p>
    ),
  };
}
