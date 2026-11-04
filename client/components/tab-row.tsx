import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

// The row the underlined tab bars draw on (2026-11-04, as NocoCRM's): one line,
// whatever the width, scrolling sideways when its tabs do not fit, since a
// wrapped tab reads as another group and leaves the open one's line hanging
// between the rows. The bar hides its scrollbar, so what lies beyond an edge
// shows by that edge fading out, and the open tab is brought to the middle as
// it opens. It also moves with the arrow keys, Home and End, opening the tab
// it lands on.

// How far the edge's fade reaches.
const FADE = '1.5rem';

// The open tab, however a bar marks it: `aria-selected` on a tab, `aria-current`
// on a link, `data-open-tab` on a link its router does not call active.
const OPEN_TAB =
  '[aria-selected="true"],[aria-current="page"],[data-open-tab="true"]';

export function TabRow({
  label,
  selected,
  tabCount,
  links = false,
  className = '',
  children,
}: {
  readonly label?: string;
  /** Which tab is open, to bring it into view as it changes. */
  readonly selected?: string;
  /** How many tabs there are, to watch each one's width (a count arriving). */
  readonly tabCount: number;
  /** Its tabs are links to addresses, so it is a navigation, not a tab list. */
  readonly links?: boolean;
  /** Where the page places it. */
  readonly className?: string;
  readonly children: ReactNode;
}): ReactElement {
  const rowRef = useRef<HTMLDivElement>(null);
  const [beyond, setBeyond] = useState({ left: false, right: false });
  // The reader has moved the row themselves since the open tab last changed.
  const movedRef = useRef(false);
  const arrivedRef = useRef(false);
  const showOpenTab = useCallback((behavior: ScrollBehavior) => {
    const row = rowRef.current;
    const tab = row?.querySelector<HTMLElement>(OPEN_TAB);
    if (row && tab && row.scrollWidth > row.clientWidth)
      row.scrollTo({
        left: tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2,
        behavior,
      });
  }, []);
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => {
      const left = row.scrollLeft > 1;
      const right = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
      setBeyond((current) =>
        current.left === left && current.right === right
          ? current
          : { left, right },
      );
    };
    row.addEventListener('scroll', measure, { passive: true });
    // It reports each size once as it starts, so this measures at once too.
    // A tab changing width (a name or a count arriving) moves the open one,
    // which is found again unless the reader has moved the row.
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(() => {
            if (!movedRef.current) showOpenTab('auto');
            measure();
          });
    observer?.observe(row);
    for (const tab of row.children) observer?.observe(tab);
    return () => {
      row.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [tabCount, showOpenTab]);
  // At once on arriving, smoothly on a change.
  useEffect(() => {
    movedRef.current = false;
    showOpenTab(arrivedRef.current ? 'smooth' : 'auto');
    arrivedRef.current = true;
  }, [selected, showOpenTab]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tabs = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        links ? 'a' : '[role="tab"]',
      ),
    ];
    const at = tabs.indexOf(event.target as HTMLElement);
    if (at < 0) return;
    const next = {
      ArrowRight: tabs[(at + 1) % tabs.length],
      ArrowLeft: tabs[(at - 1 + tabs.length) % tabs.length],
      Home: tabs[0],
      End: tabs[tabs.length - 1],
    }[event.key];
    if (!next) return;
    event.preventDefault();
    next.focus();
    next.click();
  };
  const fade = `linear-gradient(to right, ${
    beyond.left ? `transparent, black ${FADE}` : 'black'
  }, ${beyond.right ? `black calc(100% - ${FADE}), transparent` : 'black'})`;
  return (
    // The rule is drawn outside the scrolling row, which would clip a border
    // below it, and under the tabs, each tab's 2px line lying over it.
    <div
      className={`relative w-full min-w-0 before:absolute before:inset-x-0 before:bottom-0 before:h-px before:bg-border ${className}`}
    >
      <div
        ref={rowRef}
        role={links ? 'navigation' : 'tablist'}
        aria-label={label}
        onKeyDown={onKeyDown}
        onPointerDown={() => {
          movedRef.current = true;
        }}
        onWheel={() => {
          movedRef.current = true;
        }}
        className='relative flex gap-x-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        // Only the tabs fade: the rule under them runs the whole width.
        style={
          beyond.left || beyond.right
            ? { maskImage: fade, WebkitMaskImage: fade }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
