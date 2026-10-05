import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQueryClient } from '@tanstack/react-query';

import { useApi } from './api.js';
import { personRecoveryQuery } from './recovery.js';

/**
 * Says what an act did, once it has (2026-10-05).
 *
 * Returning, taking back, reclaiming and handing over all end the same way:
 * the thing leaves a list, and a row that disappears says nothing about
 * whether the act worked or what it left behind. The board used to answer
 * that with a 已完成 list under each column; a toast says it where the act
 * was done, the moment it is done. For somebody who has left it adds how
 * much of their handover is left — or that there is nothing — read from the
 * same plan their 归属 tab reads, after the act, so the number is the one
 * the tab now shows.
 *
 * It owns the refresh too: the register is reread first (`['itam']`, as
 * every write does), so the toast and the page agree.
 */
export function useAnnounce(): (
  title: string,
  people?: readonly (string | null | undefined)[],
) => Promise<void> {
  const { t } = useTranslation();
  const toaster = useToaster();
  const queryClient = useQueryClient();
  const api = useApi();
  return async (title, people = []) => {
    await queryClient.invalidateQueries({ queryKey: ['itam'] });
    const lines: string[] = [];
    for (const id of new Set(people.filter((value) => Boolean(value)))) {
      try {
        const plan = await queryClient.fetchQuery({
          ...personRecoveryQuery(api, id as string),
          staleTime: 0,
        });
        // Only a handover under way: somebody still here, or who left with
        // nothing to hand over, has no "left to do" to speak of.
        if (plan.employmentStatus !== 'left' || !plan.progress) continue;
        const left = plan.items.length + plan.owned.length;
        const name = plan.name ?? '';
        lines.push(
          left > 0
            ? t('people.recovery.toast.remaining', { name, count: left })
            : t('people.recovery.toast.complete', { name }),
        );
      } catch {
        // A reader who may not read the person still learns the act worked.
      }
    }
    toaster.show({
      type: 'success',
      title,
      ...(lines.length > 0 ? { description: lines.join('\n') } : {}),
    });
  };
}
