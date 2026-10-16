import { CheckCircle2Icon, MoreHorizontalIcon } from 'lucide-react';
import { createElement, type KeyboardEvent, type ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';
import { Button } from '#components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from '#components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { cn } from 'cn';

import {
  actionLabel,
  useInboxFrameText,
  type InboxFrameText,
} from './frame.js';
import {
  INBOX_ACTION_ICON,
  inboxActionsFor,
  type InboxAction,
} from './inbox-actions.js';
import { isSettled, kindOf, relativeTime, type InboxEntry } from './model.js';
import { ContributorScope } from './registry-scope.js';
import {
  rendererKey,
  useRendererOf,
  type InboxEntryRenderer,
} from './registry.js';

export interface InboxTypeIconProps {
  readonly entry: InboxEntry;
  readonly renderer: InboxEntryRenderer<never>;
}

/**
 * The icon of an item: its contributor's, amber for a decision that still waits, a check once its decision is
 * settled.
 */
export function InboxTypeIcon({
  entry,
  renderer,
}: InboxTypeIconProps): ReactElement {
  if (isSettled(entry))
    return (
      <CheckCircle2Icon
        className='size-4 shrink-0 text-emerald-600 dark:text-emerald-400'
        aria-hidden='true'
      />
    );
  // The contributor's icon component, chosen per item.
  return createElement(renderer.icon(entry), {
    'aria-hidden': true,
    className: cn(
      'size-4 shrink-0',
      kindOf(entry) === 'decision'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-muted-foreground',
    ),
  });
}

export interface InboxItemCardProps {
  readonly entry: InboxEntry;
  readonly selected: boolean;
  readonly busy: boolean;
  /** Arrived by a realtime push after the list first loaded: slides in. */
  readonly fresh?: boolean;
  readonly onSelect: (entry: InboxEntry) => void;
  readonly onOpen: (entry: InboxEntry) => void;
  readonly onAction: (entry: InboxEntry, action: InboxAction) => void;
}

/** A card, worded by the item's contributor in its own namespace (`registry.ts`). */
export function InboxItemCard(props: InboxItemCardProps): ReactElement {
  const renderer = useRendererOf()(props.entry);
  const frame = useInboxFrameText();
  return (
    <ContributorScope
      key={rendererKey(renderer)}
      namespace={renderer.namespace}
      resources={renderer.resources}
    >
      <ItemCard {...props} renderer={renderer} frame={frame} />
    </ContributorScope>
  );
}

/**
 * One compact card of the inbox list. Clicking anywhere on it shows it in the detail pane (and marks it read); Enter on a focused card opens its route. The card reads: what it is about (an issue's identifier), type, ×N and time, then its title
 * and, after it on the same line, one sentence, as its contributor words them. A decision that still waits carries an amber bar, an unread card a
 * dot and a bold title, a settled decision is dimmed with a check, and an item that arrived after the list loaded
 * slides in. The menu button and a right-click offer read / unread and delete.
 */
function ItemCard({
  entry,
  renderer,
  frame,
  selected,
  busy,
  fresh,
  onSelect,
  onOpen,
  onAction,
}: InboxItemCardProps & {
  readonly renderer: InboxEntryRenderer<never>;
  readonly frame: InboxFrameText;
}): ReactElement {
  const { t, language } = frame;
  const wording = renderer.useWording();
  const { item, notice } = entry;
  const { title, sentence } = wording.text(entry);
  const unread = !item.readAt;
  const settled = isSettled(entry);
  const waiting = kindOf(entry) === 'decision' && !settled;
  const actions = inboxActionsFor(entry);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      onOpen(entry);
    }
  }

  const menuItems = (
    Item: typeof DropdownMenuItem | typeof ContextMenuItem,
  ): ReactElement[] =>
    actions.map((action) => {
      const Icon = INBOX_ACTION_ICON[action];
      return (
        <Item
          key={action}
          disabled={busy}
          onClick={() => onAction(entry, action)}
        >
          <Icon />
          {actionLabel(t, action)}
        </Item>
      );
    });

  return (
    <ContextMenu>
      <ContextMenuTrigger
        data-inbox-item={item.id}
        data-selected={selected ? 'true' : undefined}
        className={cn(
          // Application change: pulled out by its padding and border, so its
          // words start under the tabs' icons, its bar in the gutter
          // (inbox-decisions-view.tsx).
          'group relative flex items-start gap-3 rounded-lg border border-transparent -mx-[calc(--spacing(3)+1px)] p-3 transition-[background-color,border-color,opacity] duration-200',
          // Application change: the selected card without a border, on the
          // menu's own grey, the list being white.
          selected ? 'bg-hover' : 'hover:bg-hover',
          settled && 'opacity-55',
          fresh &&
            'animate-in duration-200 fade-in slide-in-from-top-1 motion-reduce:animate-none',
        )}
      >
        {/* Application change: laid out as the AI suggestions' cards
            (inbox-decisions-view.tsx): no icon, the bar at the card's edge
            marking what is unread, then two lines, the title and the time,
            then the sentence; no kind tag, the title saying what happened
            and to what. */}
        <span
          aria-hidden='true'
          className={cn(
            'absolute top-3 bottom-3 -left-px w-0.5 rounded-full',
            selected
              ? 'bg-primary'
              : waiting
                ? 'bg-amber-500'
                : unread
                  ? 'bg-primary/70'
                  : 'bg-transparent',
          )}
        />
        <button
          type='button'
          aria-current={selected ? 'true' : undefined}
          // Stretched over the whole card, so a click anywhere on it selects the item.
          className="grid min-w-0 flex-1 cursor-pointer gap-1 text-left after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none"
          onClick={() => onSelect(entry)}
          onKeyDown={onKeyDown}
        >
          <span className='flex min-w-0 items-baseline gap-1.5'>
            <span
              className={cn(
                'min-w-0 truncate text-sm group-has-focus-visible:underline',
                unread ? 'font-semibold' : 'font-medium',
              )}
            >
              {title}
              {unread ? (
                <span className='sr-only'>
                  {t('inbox.unread', { defaultValue: 'Unread' })}
                </span>
              ) : null}
            </span>
            {notice && notice.count > 1 ? (
              <span className='shrink-0 text-xs text-muted-foreground tabular-nums'>
                {t('inbox.count', {
                  count: notice.count,
                  defaultValue: '×{{count}}',
                })}
              </span>
            ) : null}
            {/* The latest notice's time: a merged item (×N) is sent anew, replacing the previous one. */}
            {/* Application change: the menu button takes the time's place
                while the card is hovered or its menu open, rather than a
                column of its own at the card's right. */}
            <time
              className='ml-auto shrink-0 text-xs text-muted-foreground tabular-nums group-has-focus-visible:invisible group-hover:invisible group-has-data-popup-open:invisible'
              dateTime={item.createdAt}
              title={new Date(item.createdAt).toLocaleString(language)}
            >
              {relativeTime(item.createdAt, language)}
            </time>
          </span>
          {sentence || settled || notice?.subject?.label ? (
            <span className='line-clamp-1 text-xs text-muted-foreground'>
              {settled ? (
                <>
                  {/* Application change (ITAM): ITAM's status tag, its
                      shadcn badge having no success variant. */}
                  <StatusBadge tone='success' size='sm'>
                    {t('inbox.resolved', { defaultValue: 'Handled' })}
                  </StatusBadge>{' '}
                </>
              ) : null}
              {notice?.subject?.label ? (
                <span className='font-mono'>{notice.subject.label} </span>
              ) : null}
              {sentence}
            </span>
          ) : null}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant='ghost'
                size='icon-xs'
                disabled={busy}
                className='absolute top-2 right-2 opacity-0 group-hover:opacity-100 group-has-focus-visible:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100'
                aria-label={t('inbox.actionsFor', {
                  title,
                  defaultValue: 'Actions for {{title}}',
                })}
              />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-auto min-w-40'>
            <DropdownMenuGroup>{menuItems(DropdownMenuItem)}</DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>{menuItems(ContextMenuItem)}</ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}
