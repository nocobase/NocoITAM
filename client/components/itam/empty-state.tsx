import type { ReactElement, ReactNode } from 'react';

export interface EmptyStateProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly icon?: ReactNode;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: EmptyStateProps): ReactElement {
  return (
    <div
      data-slot='empty-state'
      className='flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center'
    >
      {icon ? (
        <div className='text-muted-foreground [&_svg]:size-8'>{icon}</div>
      ) : null}
      <div className='font-medium'>{title}</div>
      {description ? (
        <p className='max-w-md text-sm text-muted-foreground'>{description}</p>
      ) : null}
      {action ? <div className='mt-2'>{action}</div> : null}
    </div>
  );
}
