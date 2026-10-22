import type { ReactElement, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { LucideIcon } from 'lucide-react';

// Tabs that are addresses (the settings' pages, ported from NocoCRM),
// drawn as a record page's tabs are (DetailPage in
// components/itam/detail-page.tsx): underlined on a thin rule, the open one
// in the foreground over a 2px line of it, the others muted until hovered,
// each led by its icon. A click replaces the address, so the browser's back
// leaves the page rather than stepping through its tabs.
export function LinkTabs({
  tabs,
  label,
  className = '',
}: {
  tabs: readonly {
    to: string;
    label: ReactNode;
    icon: LucideIcon;
    selected: boolean;
  }[];
  label?: string;
  // Where the page places it: close under its heading.
  className?: string;
}): ReactElement {
  const navigate = useNavigate();
  return (
    <div
      role='tablist'
      aria-label={label}
      className={`flex w-full flex-wrap gap-x-5 border-b border-border ${className}`}
    >
      {tabs.map(({ to, label: name, icon: Icon, selected }) => (
        <button
          key={to}
          type='button'
          role='tab'
          aria-selected={selected}
          onClick={() => void navigate(to, { replace: true })}
          className={`-mb-px flex h-10 items-center gap-1.5 border-b-2 text-sm font-medium transition-colors outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset ${
            selected
              ? 'border-primary text-primary'
              : 'border-transparent text-foreground hover:text-primary'
          }`}
        >
          <Icon className='size-4' />
          {name}
        </button>
      ))}
    </div>
  );
}
