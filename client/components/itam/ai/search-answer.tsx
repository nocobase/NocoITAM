import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowRight,
  CircleAlert,
  LoaderCircle,
  MessageSquare,
  Sparkles,
  X,
} from 'lucide-react';
import type { ReactElement } from 'react';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router';
import remarkGfm from 'remark-gfm';

import { Button } from '@/components/ui/button';
import { useItamList, type ItamRecord } from '@/lib/itam/api';
import { useOpenRecord } from '@/lib/itam/record-drawer';
import { referencePath } from '@/lib/itam/references';
import {
  SEARCH_PAGES,
  foundListUrl,
  searchRowDetail,
  searchRowTitle,
  type FoundRecordSet,
} from '@/lib/itam/search';

/** Records the card lists before "show all" takes over. */
const PREVIEW = 5;

/**
 * The AI's answer to a question asked in the search dialog, under the box
 * rather than in the side panel — as Slack, Glean and Rovo put an AI answer
 * at the top of the results: the step under way while it works, then its
 * sentence and the records it handed over, the first few opening in the
 * record drawer and all of them on their list. The search keeps what it
 * shows (`GlobalSearchProvider`); the card only draws it.
 */
export function SearchAnswer({
  working,
  step,
  text,
  found,
  decision,
  failed,
  onClose,
  onLeave,
  onFollowUp,
  onOpenConversation,
}: {
  readonly working: boolean;
  readonly step?: string;
  readonly text: string;
  readonly found: FoundRecordSet | undefined;
  /** The AI proposed a change that only its conversation can confirm. */
  readonly decision: boolean;
  readonly failed?: string;
  readonly onClose: () => void;
  /** Called before the card leads away: to a record or a list. */
  readonly onLeave: () => void;
  /** 继续追问: a new conversation in the panel, about this answer. */
  readonly onFollowUp: () => void;
  /** The kept conversation, in the panel. */
  readonly onOpenConversation: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <section
      aria-live='polite'
      className='rounded-xl border border-border bg-card p-4 shadow-xs'
    >
      <header className='flex items-center gap-2'>
        <Sparkles
          className='size-4 shrink-0 text-success-foreground'
          aria-hidden='true'
        />
        <h2 className='min-w-0 flex-1 truncate text-sm font-medium'>
          {t('search.answerTitle')}
        </h2>
        {!working && !decision && failed === undefined ? (
          <Button variant='ghost' size='sm' onClick={onFollowUp}>
            <MessageSquare data-icon='inline-start' />
            {t('search.followUp')}
          </Button>
        ) : null}
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label={t('search.closeAnswer')}
          onClick={onClose}
        >
          <X />
        </Button>
      </header>

      {working ? (
        <p className='mt-2 flex items-center gap-2 text-sm text-muted-foreground'>
          <LoaderCircle className='size-4 animate-spin' aria-hidden='true' />
          {step
            ? t('search.workingStep', {
                step: t(`ai.tools.${step}`, { defaultValue: step }),
              })
            : t('search.working')}
        </p>
      ) : null}

      {text ? (
        <div className='mt-2 text-sm leading-6 [&_li]:ml-4 [&_ol]:list-decimal [&_p+p]:mt-2 [&_strong]:font-semibold [&_ul]:list-disc'>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      ) : null}

      {found ? <FoundPreview found={found} onLeave={onLeave} /> : null}

      {decision || failed !== undefined ? (
        <p
          className={`mt-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm ${failed !== undefined ? 'text-destructive' : ''}`}
        >
          <CircleAlert className='size-4 shrink-0' aria-hidden='true' />
          <span className='min-w-0 flex-1'>
            {decision
              ? t('search.needsDecision')
              : failed || t('search.failed')}
          </span>
          <Button variant='outline' size='sm' onClick={onOpenConversation}>
            {t('search.openConversation')}
          </Button>
        </p>
      ) : null}

      {found ? (
        <Button
          variant='link'
          size='sm'
          className='mt-1 px-0'
          onClick={() => {
            const url = foundListUrl(found);
            if (!url) return;
            onLeave();
            void navigate(url);
          }}
        >
          <ArrowRight data-icon='inline-start' />
          {t('search.showAllIn', {
            count: found.ids.length,
            list: t(SEARCH_PAGES[found.list]?.title ?? found.list),
          })}
        </Button>
      ) : null}
    </section>
  );
}

/** The first few of the records the AI found, read under the reader's grants. */
function FoundPreview({
  found,
  onLeave,
}: {
  readonly found: FoundRecordSet;
  readonly onLeave: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const openRecord = useOpenRecord();
  const page = SEARCH_PAGES[found.list];
  const list = useItamList<ItamRecord>(
    referencePath(page?.collection ?? found.list),
    { ids: found.ids.slice(0, PREVIEW), pageSize: PREVIEW, page: 1 },
    { enabled: Boolean(page) },
  );
  if (!page) return null;
  // The list answers in its own order; the card keeps the AI's.
  const byId = new Map(
    (list.data?.data ?? []).map((row) => [String(row.id), row]),
  );
  const rows = found.ids.slice(0, PREVIEW).flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
  return (
    <div className='mt-3'>
      <p className='px-1 text-xs font-medium text-muted-foreground'>
        {t(page.title)} · {found.ids.length}
      </p>
      <ul className='mt-1'>
        {rows.map((row) => {
          const detail = searchRowDetail(found.list, row, t);
          return (
            <li key={String(row.id)}>
              <button
                type='button'
                className='flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
                onClick={() => {
                  onLeave();
                  openRecord(`/${page.route}/${String(row.id)}`);
                }}
              >
                <span className='min-w-0 flex-1 truncate'>
                  {searchRowTitle(found.list, row)}
                </span>
                {detail ? (
                  <span className='max-w-[45%] shrink-0 truncate text-xs text-muted-foreground'>
                    {detail}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
