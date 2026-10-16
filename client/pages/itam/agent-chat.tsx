import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { BackButton } from '#components/back-button';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import { ChatConversationPage } from '#extensions/nocobase-agent-chat/conversation-page';
import { HistoryList } from '#extensions/nocobase-agent-chat/history-list';

const PATH = '/agent-chat';

/**
 * The conversations with the assistant on a page of their own (2026-10-16,
 * laid out as NocoCRM's conversations page): the heading over a rule, the
 * reader's conversations in a column on the card's white at the left (the
 * agent-chat block's list, with its search and filters), the one open
 * beside them; `/agent-chat/new` starts one, and its first message moves the
 * address to the conversation's own within the same route, so the view
 * stays. Narrow, the list and the conversation take turns. A conversation is
 * its owner's alone; the plugin answers nobody else for it.
 */
export default function AgentChatPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const isNew = conversationId === 'new';
  const openId = isNew ? null : (conversationId ?? null);
  const detailOpen = isNew || openId !== null;
  const open = (id: string): void =>
    void navigate(`${PATH}/${encodeURIComponent(id)}`);

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='shrink-0 border-b px-6 py-5 md:px-8'>
        <PageHeader
          title={t('ai.conversations.title')}
          actions={
            <Button render={<Link to={`${PATH}/new`} />} nativeButton={false}>
              <Plus />
              {t('ai.conversations.new')}
            </Button>
          }
        />
      </div>
      <div className='flex min-h-0 flex-1'>
        <div
          className={`flex min-h-0 w-full flex-col border-r bg-card p-3 lg:w-96 lg:shrink-0 ${detailOpen ? 'max-lg:hidden' : ''}`}
        >
          <div className='min-h-0 flex-1 overflow-y-auto'>
            <HistoryList activeId={openId} onOpen={open} />
          </div>
        </div>
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col ${detailOpen ? '' : 'max-lg:hidden'}`}
        >
          {detailOpen ? (
            <>
              {/* Narrow, the list and the conversation take turns. */}
              <div className='px-4 pt-3 lg:hidden'>
                <BackButton to={PATH} />
              </div>
              <ChatConversationPage
                conversationId={openId}
                newConversationPath={`${PATH}/new`}
                history={false}
              />
            </>
          ) : (
            <p className='m-auto text-sm text-muted-foreground'>
              {t('ai.conversations.nothingOpen')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
