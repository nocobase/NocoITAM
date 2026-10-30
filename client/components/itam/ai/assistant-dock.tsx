import {
  useChatPanel,
  useChatSources,
} from '@nocobase/app-plugin-agents/client/chat';
import { useTranslation } from '@nocobase/i18n/client';
import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useLocation } from 'react-router';

import { useIsMobile } from '#hooks/use-mobile';
import { Button } from '#components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#components/ui/tooltip';
import { useItamSettings } from '@/lib/itam/api';
import { useAgentReadiness, useDiscuss } from '@/lib/itam/ask';
import { useDemoMode } from '@nocobase/app-plugin-demo-mode/client';

import { AskComposer } from './ask-composer.js';
import { useAskDraft, useFocusReturn } from './ask-draft.js';

/**
 * The assistant's general entry (2026-10-16, ported from NocoCRM's
 * `assistant-dock.tsx`): a box floating at the bottom of the main column. A
 * question typed there, or one of the page's suggested questions, opens the
 * panel on a new conversation and sends it; on a record's page the
 * conversation starts from that record (the page offers it through
 * `useAiPageContext`). One line until it is clicked, it then opens into the
 * ask composer with its files and its model, and closes to one line again
 * once focus leaves an empty box. On a phone it is a round button in the
 * corner that opens the panel. It hides while the panel is open, on the
 * pages it would cover, and when 设置 → 通用 → AI 助手 switches it off; the
 * header's ✨ button stays either way. Pages keep room at their foot for it
 * (`Page`, `DetailPage`).
 */

/**
 * Pages the dock is not shown on: the workbench, a board filling the window
 * whose columns end where it would sit; a conversation's own page, which has
 * a composer of its own; and 设置, whose tables and save buttons it would
 * cover.
 */
function hiddenOn(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/agent-chat' ||
    pathname.startsWith('/agent-chat/') ||
    pathname === '/settings' ||
    pathname.startsWith('/settings/')
  );
}

/** The questions a page suggests, by the record it shows; keys under `ai.dock.q`. */
const RECORD_QUESTIONS: Readonly<Record<string, readonly string[]>> = {
  devices: ['device.state', 'device.repairOrReplace', 'device.history'],
  people: ['person.holdings', 'person.next'],
  purchaseOrders: ['order.state', 'order.arrival'],
  entitlements: ['entitlement.seats', 'entitlement.renewal'],
  stockItems: ['stock.level'],
  repairs: ['repair.state'],
  disposals: ['disposal.next'],
  auditTasks: ['audit.differences'],
  models: ['model.devices'],
};
/** …or else by its path. */
const PAGE_QUESTIONS: Readonly<Record<string, readonly string[]>> = {
  '/devices': ['devices.idle', 'devices.warranty'],
  '/entitlements': ['entitlements.renewing', 'entitlements.overAllocated'],
  '/purchases': ['procurement.waiting', 'procurement.late'],
  '/repairs': ['repairs.open'],
  '/accessories': ['stock.low'],
  '/consumables': ['stock.low'],
  '/components': ['stock.low'],
  '/people': ['people.leavers', 'people.joiners'],
  '/audits': ['audits.progress'],
  '/disposals': ['disposals.waiting'],
  '/reports': ['reports.summary'],
};

export function AssistantDock(): ReactElement | null {
  const { t } = useTranslation();
  const readiness = useAgentReadiness();
  const panelOpen = useChatPanel().open;
  const discuss = useDiscuss();
  // The record the page offers, if it offers one.
  const record = useChatSources().items[0];
  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  const settings = useItamSettings();
  // On a Demo Mode deployment the dock takes a question all the same and
  // opens the panel on it, which says the demo cannot send it (2026-10-25,
  // `useAskDraft`).
  const demo = useDemoMode();
  const unavailable =
    readiness.state === 'unavailable' && !demo ? readiness.reason : undefined;
  const draft = useAskDraft(record, readiness.state !== 'ready' && !demo);
  // Focus is in the dock, or its model menu (which lies outside it) is open.
  const [focused, setFocused] = useState(false);
  const [modelMenu, setModelMenu] = useState(false);
  // The suggestions show while the box is focused and empty, until Esc.
  const [listOpen, setListOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const phoneRef = useRef<HTMLButtonElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  // Focus given back when the panel closes leaves the dock one line: it
  // opens once the reader presses it or types, not by itself (2026-10-16,
  // as NocoCRM's).
  const quietRef = useRef(false);
  useFocusReturn(() => {
    quietRef.current = !isMobile;
    return isMobile ? phoneRef.current : inputRef.current;
  });
  // A press outside closes it too, focus or not: a page that drags on a
  // press keeps focus where it was, so no blur would come. Its model menu,
  // outside it while open, keeps it open (2026-10-16, as NocoCRM's).
  useEffect(() => {
    if (!focused || modelMenu) return;
    const outside = (event: PointerEvent): void => {
      const target = event.target as Element | null;
      if (target && dockRef.current?.contains(target)) return;
      // The veil closes it on its click (below).
      if (target?.closest?.('[data-dock-veil]')) return;
      if (dockRef.current?.contains(document.activeElement))
        (document.activeElement as HTMLElement | null)?.blur();
      setFocused(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [focused, modelMenu]);

  const absent =
    readiness.state === 'loading' ||
    hiddenOn(pathname) ||
    settings.data?.ai.assistantDock === false;
  // Pages keep room at their foot for the box only while it is there
  // (`Page` in page-header.tsx reads this mark, 2026-10-16): switched off,
  // on a page without it, or under the open panel, the room was empty.
  const shown = !absent && !panelOpen;
  useEffect(() => {
    if (!shown) return;
    document.documentElement.dataset.askDock = '';
    return () => {
      delete document.documentElement.dataset.askDock;
    };
  }, [shown]);
  if (absent) return null;
  const questions = record
    ? (RECORD_QUESTIONS[record.kind] ?? [])
    : (PAGE_QUESTIONS[pathname] ?? []);
  // One prompt everywhere (2026-10-16): the record still goes with the
  // question as context, and its name made the box wrap onto two lines.
  const placeholder = unavailable ?? t('ai.dock.placeholder');
  // Open while it is being used or holds something; one line otherwise.
  const expanded =
    !unavailable &&
    (focused ||
      modelMenu ||
      Boolean(draft.value) ||
      draft.files.files.length > 0);
  // Sent, by Enter, the send button or a suggestion: the box closes, so its
  // suggestions do not come back over the emptied box.
  const sending: typeof draft = {
    ...draft,
    send: (prompt) => {
      const sent = draft.send(prompt);
      if (sent) {
        setListOpen(false);
        setFocused(false);
      }
      return sent;
    },
  };
  const send = (prompt: string): void => {
    sending.send(prompt);
  };

  const box = (
    <AskComposer
      draft={sending}
      placeholder={placeholder}
      disabled={Boolean(unavailable)}
      expanded={expanded}
      inputRef={inputRef}
      // Lifted off the page as well as framed.
      className={`[--itam-ai-lift:var(--shadow-lg)] ${
        expanded ? 'rounded-3xl' : 'h-11 rounded-full'
      }`}
      inputClassName='px-4 pt-3 pb-1 text-sm'
      onModelMenu={setModelMenu}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setListOpen(false);
      }}
    />
  );

  return (
    <TooltipProvider>
      {/* While the box is in use, a veil over the page under it, drawn as a
          dialog's backdrop (2026-10-16, as NocoCRM's): a press beside the
          box lands on the veil and only closes the box, rather than on the
          list or the board behind it. */}
      {focused && !isMobile && !panelOpen ? (
        <div
          aria-hidden
          data-dock-veil=''
          // Drawn as a dialog's backdrop (ui/dialog.tsx).
          className='fixed inset-0 z-40 bg-black/10 duration-100 animate-in fade-in-0 supports-backdrop-filter:backdrop-blur-xs'
          // Closed on its own click, so the press's click lands here and
          // never reaches the row it covers.
          onClick={() => {
            if (dockRef.current?.contains(document.activeElement))
              (document.activeElement as HTMLElement | null)?.blur();
            setFocused(false);
          }}
        />
      ) : null}
      <div
        // Over the bottom of the main column, below the header and every
        // overlay, above a page's sticky bars (z-10); while in use, over its
        // veil, which covers the header (z-40) as a dialog's backdrop does,
        // every overlay (z-50) still above.
        className={`pointer-events-none absolute inset-x-0 bottom-4 flex justify-end px-4 md:justify-center ${
          focused && !isMobile ? 'z-40' : 'z-20'
        }`}
        hidden={panelOpen}
      >
        {isMobile ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  ref={phoneRef}
                  size='icon-lg'
                  aria-label={unavailable ?? t('ai.ask')}
                  disabled={Boolean(unavailable)}
                  className='pointer-events-auto rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90'
                  // A new conversation with the record pinned, nothing
                  // sent: the person writes in the panel.
                  onClick={() => discuss(record ? [record] : [])}
                />
              }
            >
              <Sparkles />
            </TooltipTrigger>
            <TooltipContent>{unavailable ?? t('ai.ask')}</TooltipContent>
          </Tooltip>
        ) : (
          <div
            ref={dockRef}
            className={`pointer-events-auto relative w-full ${
              expanded ? 'max-w-[32rem]' : 'max-w-[22rem]'
            }`}
            onFocus={() => {
              if (quietRef.current) {
                quietRef.current = false;
                return;
              }
              if (!focused) setListOpen(true);
              setFocused(true);
            }}
            // Pressed while it already holds focus (given back quietly):
            // it opens as a focus would open it.
            onPointerDown={() => {
              if (focused) return;
              setListOpen(true);
              setFocused(true);
            }}
            onBlur={(event) => {
              const next = event.relatedTarget;
              if (next) {
                if (!dockRef.current?.contains(next)) setFocused(false);
                return;
              }
              // Focus went to no element: a click on the page, or another
              // window (the file picker), which keeps the dock's element
              // active and so does not close it.
              window.setTimeout(() => {
                if (
                  document.hasFocus() &&
                  !dockRef.current?.contains(document.activeElement)
                )
                  setFocused(false);
              });
            }}
          >
            {unavailable ? (
              // Disabled controls take no pointer events, so the reason's
              // tooltip hangs on a wrapper around the box.
              <Tooltip>
                <TooltipTrigger render={<div className='w-full' />}>
                  {box}
                </TooltipTrigger>
                <TooltipContent>{unavailable}</TooltipContent>
              </Tooltip>
            ) : (
              box
            )}
            {/* After the box in the document, so Tab moves from the box to
                the suggestions; drawn above it. */}
            {focused &&
              listOpen &&
              !draft.value &&
              !draft.files.files.length &&
              questions.length > 0 &&
              !unavailable && (
                <ul
                  aria-label={t('ai.dock.suggestions')}
                  className='absolute bottom-full mb-2 flex w-full flex-col gap-0.5 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg'
                >
                  {questions.map((key) => {
                    const question = t(`ai.dock.q.${key}`);
                    return (
                      <li key={key}>
                        <Button
                          variant='ghost'
                          size='sm'
                          className='w-full justify-start font-normal'
                          // A click lands before the box's blur hides the list.
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => send(question)}
                        >
                          <Sparkles className='text-primary' />
                          <span className='truncate'>{question}</span>
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
