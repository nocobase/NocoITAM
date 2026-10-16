import {
  useChatPanel,
  useChatSources,
} from '@nocobase/app-plugin-agents/client/chat';
import { useTranslation } from '@nocobase/i18n/client';
import { Sparkles } from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';
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
  '/procurement': ['procurement.waiting', 'procurement.late'],
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
  const unavailable =
    readiness.state === 'unavailable' ? readiness.reason : undefined;
  const draft = useAskDraft(record, readiness.state !== 'ready');
  // Focus is in the dock, or its model menu (which lies outside it) is open.
  const [focused, setFocused] = useState(false);
  const [modelMenu, setModelMenu] = useState(false);
  // The suggestions show while the box is focused and empty, until Esc.
  const [listOpen, setListOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const phoneRef = useRef<HTMLButtonElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  useFocusReturn(() => (isMobile ? phoneRef.current : inputRef.current));

  if (
    readiness.state === 'loading' ||
    hiddenOn(pathname) ||
    settings.data?.ai.assistantDock === false
  )
    return null;
  const questions = record
    ? (RECORD_QUESTIONS[record.kind] ?? [])
    : (PAGE_QUESTIONS[pathname] ?? []);
  const placeholder =
    unavailable ??
    (record
      ? t('ai.dock.placeholderAbout', { name: record.label })
      : t('ai.dock.placeholder'));
  // Open while it is being used or holds something; one line otherwise.
  const expanded =
    !unavailable &&
    (focused ||
      modelMenu ||
      Boolean(draft.value) ||
      draft.files.files.length > 0);
  const send = (prompt: string): void => {
    if (draft.send(prompt)) setFocused(false);
  };

  const box = (
    <AskComposer
      draft={draft}
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
      <div
        // Over the bottom of the main column, below the header and every
        // overlay, above a page's sticky bars (z-10).
        className='pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-end px-4 md:justify-center'
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
              if (!focused) setListOpen(true);
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
