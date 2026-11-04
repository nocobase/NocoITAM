// An underlined tab on a TabRow (tab-row.tsx): the open one in the brand colour
// over a 2px line of it, the others in the foreground until hovered, whole on
// one line.
export const tabClass = (selected: boolean): string =>
  `flex h-10 shrink-0 items-center gap-1.5 border-b-2 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset ${
    selected
      ? 'border-primary text-primary'
      : 'border-transparent text-foreground hover:text-primary'
  }`;
