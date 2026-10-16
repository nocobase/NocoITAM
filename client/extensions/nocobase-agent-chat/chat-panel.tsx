/**
 * The chat panel. Application change (ITAM, 2026-10-16): fixed at the window's right edge, 28rem, as NocoCRM's
 * panel is (the page makes room for it from 1280px); it is not a dialog and traps no focus; Escape closes it. Below
 * `md` it is a full-screen dialog. Once opened it stays mounted while closed, so the conversation's subscriptions carry
 * on.
 *
 * It needs `ChatProvider` above it.
 */
import {
  CHAT_MOBILE_QUERY,
  CHAT_PANEL_ATTRIBUTE,
  CHAT_PANEL_ID,
  useChatPanel,
} from '@nocobase/app-plugin-agents/client/chat';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { Dialog, DialogContent, DialogTitle } from '#components/ui/dialog';

import { useChatTranslation } from './chat-i18n.js';
import { ConversationView } from './conversation-view.js';
import { HistoryList } from './history-list.js';
import { PanelHeader } from './panel-header.js';
import { useMediaQuery } from './use-media-query.js';

/** The chat panel; nothing while `ChatProvider` says the panel is not available (signed out, no provider). */
export function ChatPanel(): ReactElement | null {
  const panel = useChatPanel();
  return panel.available ? <PanelFrame /> : null;
}

function PanelFrame(): ReactElement | null {
  const { t } = useChatTranslation();
  const panel = useChatPanel();
  const mobile = useMediaQuery(CHAT_MOBILE_QUERY);
  const [mounted, setMounted] = useState(panel.open);
  const asideRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  if (panel.open && !mounted) setMounted(true);

  const { closeChat, open } = panel;
  useEffect(() => {
    const element = asideRef.current;
    if (!element || !open) return undefined;
    // A native listener: Escape inside a menu or a select (rendered in a portal) never reaches it.
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      closeChat();
    }
    element.addEventListener('keydown', onKeyDown);
    return () => element.removeEventListener('keydown', onKeyDown);
  }, [open, closeChat, mounted, mobile]);
  // The page makes room for the panel (styles.css).
  useEffect(() => {
    document.body.classList.toggle('itam-agent-panel-open', open && !mobile);
    return () => document.body.classList.remove('itam-agent-panel-open');
  }, [open, mobile]);

  if (!mounted) return null;
  const marker = { [CHAT_PANEL_ATTRIBUTE]: '' };

  if (mobile)
    return (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) closeChat();
        }}
      >
        <DialogContent
          ref={dialogRef}
          // The dialog itself takes the focus on opening: its first control is the title's rename button, whose focus
          // ring would greet every opening, and focusing the box would raise the keyboard over the conversation.
          initialFocus={dialogRef}
          id={CHAT_PANEL_ID}
          {...marker}
          showCloseButton={false}
          className='flex h-dvh max-h-dvh w-full max-w-none flex-col gap-0 rounded-none p-0 sm:max-w-none'
          data-testid='chat-panel'
          data-mode='mobile'
        >
          <DialogTitle className='sr-only'>{t('chat.title')}</DialogTitle>
          <PanelHeader compact />
          <PanelBody />
        </DialogContent>
      </Dialog>
    );

  // Application change (ITAM, 2026-10-16, after NocoCRM's panel): one
  // form from `md` up, fixed at the window's right edge over the whole
  // height (above the sticky header, z-40; dialogs and menus stay above it),
  // 28rem wide; from 1280px the page makes room for it (`itam-page-main`,
  // styles.css), narrower it lies over the page. No docked, floating or
  // expanded forms: a conversation's own page is the wide view.
  return (
    <aside
      ref={asideRef}
      id={CHAT_PANEL_ID}
      {...marker}
      aria-label={t('chat.title')}
      hidden={!open}
      data-mode='docked'
      data-testid='chat-panel'
      className='fixed inset-y-0 right-0 z-40 flex w-[28rem] max-w-full flex-col border-l border-border bg-background shadow-lg'
    >
      <PanelHeader compact={false} />
      <PanelBody />
    </aside>
  );
}

function PanelBody(): ReactElement {
  const panel = useChatPanel();
  return (
    // Application change (ITAM): NocoCRM's margins, px-4.
    <div className='flex min-h-0 flex-1 flex-col px-4'>
      {panel.view === 'history' ? (
        <div className='min-h-0 flex-1 overflow-y-auto'>
          <HistoryList
            activeId={panel.conversationId}
            onOpen={(id) => {
              panel.selectConversation(id);
              panel.focusComposer();
            }}
            onOpenPage={panel.openPage}
          />
        </div>
      ) : (
        <ConversationView conversationId={panel.conversationId} />
      )}
    </div>
  );
}
