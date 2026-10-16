import {
  useAgentText,
  useConversation,
  useConversationMessages,
} from '@nocobase/app-plugin-agents/client/chat';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft, MessageSquarePlus, Sparkles } from 'lucide-react';
import { useEffect, type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';
import { ChatMarkdown } from '#extensions/nocobase-agent-chat/chat-markdown';

/**
 * A question from the global search answered in its dialog (2026-10-16,
 * ported from NocoCRM's `search-answer.tsx`): the question, then the reply
 * as it is written, a line saying the AI is at work while it is; under them
 * the way back to the results, which discards it, and going on asking, which
 * keeps it as a conversation and opens it in the panel.
 */
export function SearchAnswer({
  conversationId,
  question,
  failed,
  onRunning,
  onBack,
  onContinue,
}: {
  /** Null while the conversation is being created. */
  readonly conversationId: string | null;
  readonly question: string;
  /** The question could not be asked. */
  readonly failed: boolean;
  /** Told whether the reply is still being written, as that changes. */
  readonly onRunning: (running: boolean) => void;
  /** Back to the results. */
  readonly onBack: () => void;
  readonly onContinue: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const agentText = useAgentText();
  const detail = useConversation(conversationId);
  const conversation = detail.data;
  const running = Boolean(conversation?.run);
  useEffect(() => onRunning(running), [onRunning, running]);
  const messages = useConversationMessages(conversationId, running);
  const replies = messages.items.filter(
    (message) => message.role === 'assistant' && message.content.content.trim(),
  );
  const name =
    (conversation?.agent ? agentText.name(conversation.agent) : null) ?? 'Noco';
  return (
    <div className='flex max-h-[min(70svh,40rem)] flex-col'>
      <div className='flex items-start gap-2 border-b border-border px-4 py-3'>
        <Sparkles className='mt-0.5 size-4 shrink-0 text-primary' />
        <p className='min-w-0 flex-1 text-sm font-medium break-words'>
          {question}
        </p>
      </div>
      <div className='min-h-24 flex-1 overflow-y-auto px-4 py-3'>
        {failed ? (
          <p className='text-sm text-destructive'>{t('ai.sendFailed')}</p>
        ) : (
          <div className='flex flex-col gap-3'>
            {replies.map((message) => (
              <div
                key={message.id}
                className='min-w-0 text-sm leading-6 [&_li]:my-1 [&_ol]:my-2 [&_p]:my-2 [&_ul]:my-2'
              >
                <ChatMarkdown content={message.content.content} />
              </div>
            ))}
            {running || !replies.length ? (
              <p
                role='status'
                className='flex items-center gap-2 text-sm text-muted-foreground'
              >
                <Spinner />
                {t('search.answering', { name })}
              </p>
            ) : null}
          </div>
        )}
      </div>
      <div className='flex items-center justify-between gap-2 border-t border-border px-3 py-2'>
        <Button variant='ghost' size='sm' onClick={onBack}>
          <ArrowLeft />
          {t('search.backToResults')}
        </Button>
        <Button
          size='sm'
          disabled={!conversationId || failed}
          onClick={onContinue}
        >
          <MessageSquarePlus />
          {t('search.continueAsking')}
        </Button>
      </div>
    </div>
  );
}
