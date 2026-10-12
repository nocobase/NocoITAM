import type { ComponentProps, ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';
import { Badge } from '#components/ui/badge';

/**
 * The settings pages' tags (ported from NocoCRM, whose Badge carries tone
 * variants): a tone reads through the template's `StatusBadge`, and the
 * Badge's own variants pass through, so the registry Badge stays unedited.
 */
const TONES = {
  success: 'success',
  info: 'info',
  warning: 'warning',
  muted: 'neutral',
} as const;

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>['variant']>;

export function ToneBadge({
  variant,
  ...props
}: Omit<ComponentProps<typeof Badge>, 'variant'> & {
  readonly variant?: BadgeVariant | keyof typeof TONES;
}): ReactElement {
  if (variant && variant in TONES)
    return (
      <StatusBadge {...props} tone={TONES[variant as keyof typeof TONES]} />
    );
  return <Badge {...props} variant={variant as BadgeVariant | undefined} />;
}
