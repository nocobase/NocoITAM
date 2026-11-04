import type { ReactElement, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { LucideIcon } from 'lucide-react';

import { tabClass } from './tab-class.js';
import { TabRow } from './tab-row.js';

// Tabs that are addresses (the settings' pages, ported from NocoCRM),
// drawn as a record page's tabs are (DetailPage in
// components/itam/detail-page.tsx): underlined on a thin rule, the open one
// in the foreground over a 2px line of it, the others muted until hovered,
// each led by its icon. A click replaces the address, so the browser's back
// leaves the page rather than stepping through its tabs. One line, scrolling
// sideways when they do not fit (TabRow), and no icons on a phone (2026-11-04).
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
    <TabRow
      label={label}
      selected={tabs.find((tab) => tab.selected)?.to}
      tabCount={tabs.length}
      className={className}
    >
      {tabs.map(({ to, label: name, icon: Icon, selected }) => (
        <button
          key={to}
          type='button'
          role='tab'
          aria-selected={selected}
          onClick={() => void navigate(to, { replace: true })}
          className={tabClass(selected)}
        >
          <Icon className='size-4 max-md:hidden' />
          {name}
        </button>
      ))}
    </TabRow>
  );
}
