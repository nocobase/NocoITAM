import { useTranslation } from '@nocobase/i18n/client';
import { Info } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * A field label with, for a value the user cannot edit because a rule
 * sets it (随型号, 随软件产品, purchase date + cycle), an info icon whose
 * tooltip states the rule. Detail rows and forms both use it, so the
 * explanation sits in one place instead of under every value.
 */
export function FieldLabel({
  label,
  hint,
  children,
}: {
  readonly label: ReactNode;
  /** Translation key of the rule; nothing is added without one. */
  readonly hint?: string;
  /** Extra marks after the label, e.g. the required asterisk. */
  readonly children?: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <span className='inline-flex items-center gap-1'>
      {label}
      {children}
      {hint ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className='inline-flex text-muted-foreground'
                tabIndex={0}
                aria-label={t(hint)}
              />
            }
          >
            <Info className='size-3.5' aria-hidden />
          </TooltipTrigger>
          <TooltipContent>{t(hint)}</TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  );
}
