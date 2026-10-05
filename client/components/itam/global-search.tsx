import { useTranslation } from '@nocobase/i18n/client';
import { Command as CommandRoot } from 'cmdk';
import { ArrowRight, Search, Sparkles } from 'lucide-react';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from 'react';
import { useNavigate } from 'react-router';

import { SearchAnswer } from '@/components/itam/ai/search-answer';
import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useAIPageElementHandle,
  type AIFrontendToolRegistration,
} from '@/extensions/nocobase-ai';
import { useItamAi, useItamSearchChat } from '@/lib/itam/ai-chat';
import { useOpenRecord } from '@/lib/itam/record-drawer';
import {
  SEARCH_PAGES,
  searchRowDetail,
  searchRowTitle,
  useSearchResults,
  type FoundRecordSet,
} from '@/lib/itam/search';
import { readSearchTurn, type SearchTurn } from '@/lib/itam/search-turn';
import { cn } from '@/lib/utils';

/** The shortcut as the reader's keyboard labels it. */
const SHORTCUT =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    ? '⌘K'
    : 'Ctrl K';

/** How many ids the AI may hand over at most; it says when it found more. */
const MAX_FOUND = 200;

type Mode = 'search' | 'ask';

interface GlobalSearch {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly value: string;
  readonly setValue: (value: string) => void;
  readonly mode: Mode;
  readonly setMode: (mode: Mode) => void;
  /** The last question asked and where its answer stands, if any. */
  readonly answer: Answer | undefined;
  readonly ask: (text: string) => void;
  readonly clearAnswer: () => void;
  /** 继续追问: a new conversation in the side panel about the answer. */
  readonly followUp: () => void;
  /** The conversation the answer kept, in the side panel. */
  readonly openConversation: () => void;
}

/** A question asked from the search, and its answer as far as it got. */
interface Answer extends Omit<SearchTurn, 'asked' | 'conversationId'> {
  /** The words the reader typed. */
  readonly question: string;
  readonly found: FoundRecordSet | undefined;
}

/** One question's run: the prompt it was sent as, and what came of it. */
interface Session {
  readonly question: string;
  readonly prompt: string;
  readonly conversationId?: string;
  /** Kept once finished, when the conversation has been let go. */
  readonly result?: Omit<SearchTurn, 'asked' | 'conversationId'>;
  readonly found?: FoundRecordSet;
  /** The reader took the conversation into the panel: never delete it. */
  readonly kept?: boolean;
}

const GlobalSearchContext = createContext<GlobalSearch | undefined>(undefined);

/**
 * The search the sidebar opens (2026-10-05), after InvGate's and the AI
 * answers of Slack, Glean and Rovo: one box over every list the reader may
 * read, in two modes.
 *
 * - **Search** answers as it is typed, without a model: matches grouped by
 *   the list they belong to, the first few each, opening in the record
 *   drawer; a group's last row opens its list searched for the same words.
 * - **Ask AI** sends the sentence to the search's own chat (`SearchChat` in
 *   the shell, a second conversation nobody sees: the side panel neither
 *   opens nor loses what it holds), with this search as page context and
 *   one frontend tool, `presentRecords`, which hands the records the AI
 *   found to the answer card (ALLOW: it only shows them).
 *
 * A search answer is not a chat the reader meant to keep: as in Rovo, it
 * becomes one only when they follow it up. So the answer is kept here once
 * it is complete and its conversation is deleted straight away; 继续追问
 * starts a new conversation in the panel with the question, the answer and
 * the records as page context. Only a turn that ended on a change waiting
 * for confirmation, or that failed, keeps its conversation, which 在对话中查看
 * opens in the panel (decided 2026-10-05).
 *
 * The state lives here, around the whole shell, rather than in the dialog:
 * closing the dialog while the AI works must not lose the answer, and the
 * tool must still be there when the AI calls it. Everybody who signs in is
 * IT (2026-10-05); what each finds is still what their grants let them
 * read, which the server decides group by group.
 */
export function GlobalSearchProvider({
  children,
}: PropsWithChildren): ReactElement {
  const { t } = useTranslation();
  const ai = useItamAi();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<Mode>('search');
  const [session, setSession] = useState<Session>();
  const chat = useItamSearchChat();

  // ⌘K (Ctrl+K off a Mac) opens it from anywhere, and closes it again —
  // the shortcut a command palette is expected to have.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== 'k' ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        event.isComposing
      )
        return;
      event.preventDefault();
      setOpen((current) => !current);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // While the question runs its answer is read from the chat; once it is
  // complete it is kept here, so deleting the conversation loses nothing.
  const turn =
    session && !session.result
      ? readSearchTurn(chat, session.prompt)
      : undefined;
  if (session && turn) {
    const conversationId = session.conversationId ?? turn.conversationId;
    const { asked: _asked, conversationId: _id, ...result } = turn;
    if (turn.asked && !turn.working)
      setSession({ ...session, conversationId, result });
    else if (conversationId !== session.conversationId)
      setSession({ ...session, conversationId });
  }
  // The conversations already let go, so none is deleted twice.
  const releasedRef = useRef(new Set<string>());
  const release = (id: string) => {
    if (releasedRef.current.has(id)) return;
    releasedRef.current.add(id);
    void ai?.search.state
      .get()
      .removeConversation?.(id)
      .catch(() => undefined);
  };
  // A complete answer lets its conversation go, unless it ended on a change
  // to confirm or failed: then the conversation is what the reader needs.
  const finished = session?.result;
  const releasable =
    finished &&
    session.conversationId &&
    !session.kept &&
    !finished.decision &&
    finished.failed === undefined
      ? session.conversationId
      : undefined;
  useEffect(() => {
    if (releasable) release(releasable);
  });

  /** Lets go of a question's conversation nothing kept, before the next. */
  const discard = () => {
    if (session?.conversationId && !session.kept)
      release(session.conversationId);
  };

  const tools = useMemo(
    (): AIFrontendToolRegistration[] => [
      {
        name: 'presentRecords',
        title: 'Present the records found',
        description: `Show the records you found under the search box, where the user opens them and goes on to their list to filter and export them. "list" is one of the lists in the page context, "ids" the ids of the records you found in it (look them up with the ITAM read tools; at most ${MAX_FOUND}), "title" a few words saying what they are, in the user's language. Call it once, for the list the question is about.`,
        permission: 'ALLOW',
        inputSchema: {
          type: 'object',
          properties: {
            list: { type: 'string', enum: Object.keys(SEARCH_PAGES) },
            ids: { type: 'array', items: { type: 'string' } },
            title: { type: 'string' },
          },
          required: ['list', 'ids', 'title'],
        },
        // The assistant supplies the arguments; read them defensively.
        execute: (args: unknown) => {
          const input = (args ?? {}) as {
            list?: unknown;
            ids?: unknown;
            title?: unknown;
          };
          const list = typeof input.list === 'string' ? input.list : '';
          if (!SEARCH_PAGES[list])
            return { error: `Unknown list: ${String(input.list)}` };
          const ids = (Array.isArray(input.ids) ? input.ids : [])
            .filter((id): id is string => typeof id === 'string' && id !== '')
            .slice(0, MAX_FOUND);
          if (ids.length === 0) return { error: 'No ids to show' };
          const found = {
            list,
            ids,
            title: typeof input.title === 'string' ? input.title.trim() : '',
          };
          setSession((current) => current && { ...current, found });
          return { shown: ids.length, list };
        },
      },
    ],
    [],
  );
  const { ref: contextRef, context } = useAIPageElementHandle({
    id: 'itam-global-search',
    title: t('search.context'),
    kind: 'search',
    getContext: () => ({
      lists: Object.entries(SEARCH_PAGES).map(([list, page]) => ({
        list,
        collection: page.collection,
        title: t(page.title),
      })),
      // What a follow-up is about: the search answer the reader is taking
      // into the conversation.
      lastAnswer: session?.result
        ? {
            question: session.question,
            answer: session.result.text,
            found: session.found,
          }
        : undefined,
    }),
    tools,
  });

  const answer: Answer | undefined = session
    ? {
        question: session.question,
        found: session.found,
        ...(session.result ?? {
          working: true,
          step: turn?.step,
          text: turn?.text ?? '',
          decision: false,
        }),
      }
    : undefined;

  const search: GlobalSearch = {
    open,
    setOpen,
    value,
    setValue,
    mode,
    setMode,
    answer,
    ask: (text) => {
      if (!ai?.available || !text) return;
      discard();
      const prompt = t('ai.prompts.globalSearch', { text });
      setSession({ question: text, prompt });
      setMode('ask');
      ai.search.ask(prompt, [context]);
    },
    clearAnswer: () => {
      discard();
      setSession(undefined);
    },
    followUp: () => {
      if (!ai || !session) return;
      setOpen(false);
      ai.ask(t('search.followUpDraft', { question: session.question }), {
        workContext: [context],
        autoSend: false,
      });
    },
    openConversation: () => {
      if (!ai || !session?.conversationId) return;
      setSession({ ...session, kept: true });
      setOpen(false);
      ai.openConversation(session.conversationId);
    },
  };

  return (
    <GlobalSearchContext.Provider value={search}>
      {/* The page element the search registers as the AI's context: always
          in the document, so its tool outlives the dialog. */}
      <span ref={contextRef} hidden />
      {children}
    </GlobalSearchContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook and its provider ship together
export function useGlobalSearch(): GlobalSearch | undefined {
  return useContext(GlobalSearchContext);
}

/**
 * The dialog the sidebar's 搜索 opens. Mounted inside the record drawer's
 * provider, so a result opens in the drawer over the page the reader is on.
 */
export function GlobalSearchDialog(): ReactElement | null {
  const { t } = useTranslation();
  const search = useGlobalSearch();
  if (!search) return null;
  return (
    <Dialog open={search.open} onOpenChange={search.setOpen}>
      <DialogContent
        showCloseButton={false}
        // A command palette's place: high on the screen, wide enough for a
        // result and its detail on one line.
        className='top-[12svh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-2xl'
      >
        <DialogTitle className='sr-only'>{t('search.label')}</DialogTitle>
        <SearchPanel search={search} />
      </DialogContent>
    </Dialog>
  );
}

function SearchPanel({
  search,
}: {
  readonly search: GlobalSearch;
}): ReactElement {
  const { t } = useTranslation();
  const ai = useItamAi();
  const navigate = useNavigate();
  const openRecord = useOpenRecord();
  const { value, setValue, mode, setMode, answer } = search;
  const asking = mode === 'ask' && Boolean(ai?.available);
  // A request per pause in typing, not per key.
  const [term, setTerm] = useState(value.trim());
  useEffect(() => {
    const timer = setTimeout(() => setTerm(value.trim()), 200);
    return () => clearTimeout(timer);
  }, [value]);
  const results = useSearchResults(asking ? '' : term);
  const groups = results.data ?? [];

  // Enter opens the first result. The selection is controlled because the
  // Noco row renders before the results arrive and would otherwise keep it;
  // a choice made with the arrows or the mouse holds until the results
  // change under it.
  const resultKey = `${term}|${groups.map((group) => `${group.key}${group.total}`).join()}`;
  const [picked, setPicked] = useState<{ results: string; value: string }>();
  const firstGroup = groups[0];
  const first = firstGroup?.rows[0];
  const selected =
    picked?.results === resultKey
      ? picked.value
      : firstGroup && first
        ? `${firstGroup.key}:${String(first.id)}`
        : 'ask-noco';

  // Leaving the dialog for a record, a list or the conversation.
  const leave = () => search.setOpen(false);

  return (
    <CommandRoot
      shouldFilter={false}
      label={t('search.label')}
      value={selected}
      onValueChange={(next) => setPicked({ results: resultKey, value: next })}
    >
      <div className='border-b border-border p-2'>
        <InputGroup className='h-10 border-transparent shadow-none has-[[data-slot=input-group-control]:focus-visible]:border-transparent has-[[data-slot=input-group-control]:focus-visible]:ring-0'>
          <InputGroupAddon>
            {asking ? (
              <Sparkles className='text-success-foreground' />
            ) : (
              <Search />
            )}
          </InputGroupAddon>
          {asking ? (
            <InputGroupInput
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              // The list root around the box takes Enter for its selection,
              // so the question is sent from here — unless Enter is
              // confirming an input method's text.
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing)
                  return;
                event.preventDefault();
                event.stopPropagation();
                search.ask(value.trim());
              }}
              placeholder={t('search.askPlaceholder')}
              aria-label={t('search.askLabel')}
            />
          ) : (
            <CommandRoot.Input
              autoFocus
              data-slot='input-group-control'
              className='h-full min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground'
              value={value}
              onValueChange={setValue}
              placeholder={t('search.placeholder')}
            />
          )}
          {ai?.available ? (
            <InputGroupAddon align='inline-end'>
              {/* Two modes, so a segmented switch like the pages' own tabs:
                  which one is on reads from the switch, and the box stays
                  a plain box. Switching focuses the new mode's input. */}
              <Tabs
                value={mode}
                onValueChange={(next) => setMode(next as Mode)}
                className='gap-0'
              >
                <TabsList className='h-7'>
                  <TabsTrigger value='search' className='px-2 text-xs'>
                    <Search />
                    {t('search.searchTab')}
                  </TabsTrigger>
                  <TabsTrigger value='ask' className='px-2 text-xs'>
                    <Sparkles className='text-success-foreground' />
                    {t('search.askAi')}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      </div>

      <div className='max-h-[min(32rem,65svh)] overflow-y-auto'>
        {!asking && term ? (
          <CommandList className='max-h-none p-1'>
            <CommandEmpty>
              {results.isFetching
                ? t('common.loading')
                : t('search.noResults', { q: term })}
            </CommandEmpty>
            {groups.map((group) => {
              const page = SEARCH_PAGES[group.key];
              if (!page) return null;
              return (
                <CommandGroup
                  key={group.key}
                  heading={`${t(page.title)} · ${group.total}`}
                >
                  {group.rows.map((row) => {
                    const detail = searchRowDetail(group.key, row, t);
                    return (
                      <CommandItem
                        key={String(row.id)}
                        value={`${group.key}:${String(row.id)}`}
                        onSelect={() => {
                          leave();
                          openRecord(`/${page.route}/${String(row.id)}`);
                        }}
                      >
                        <span className='min-w-0 flex-1 truncate'>
                          <Highlight
                            text={searchRowTitle(group.key, row)}
                            term={term}
                          />
                        </span>
                        {detail ? (
                          <span className='max-w-[45%] shrink-0 truncate text-xs text-muted-foreground'>
                            <Highlight text={detail} term={term} />
                          </span>
                        ) : null}
                      </CommandItem>
                    );
                  })}
                  {group.total > group.rows.length ? (
                    <CommandItem
                      value={`${group.key}:all`}
                      className='text-muted-foreground'
                      onSelect={() => {
                        leave();
                        void navigate(
                          `/${page.route}?${new URLSearchParams({ q: term }).toString()}`,
                        );
                      }}
                    >
                      <ArrowRight />
                      {t('search.showAllIn', {
                        count: group.total,
                        list: t(page.title),
                      })}
                    </CommandItem>
                  ) : null}
                </CommandGroup>
              );
            })}
            {ai?.available ? (
              // Words the register does not contain may still be a
              // question: one step from here to asking it.
              <CommandGroup>
                <CommandItem
                  value='ask-noco'
                  className='text-success-foreground'
                  onSelect={() => search.ask(term)}
                >
                  <Sparkles />
                  <span className='truncate'>
                    {t('search.askAbout', { q: term })}
                  </span>
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        ) : answer ? (
          <div className='p-3'>
            <SearchAnswer
              working={answer.working}
              step={answer.step}
              text={answer.text}
              found={answer.found}
              decision={answer.decision}
              failed={answer.failed}
              onLeave={leave}
              onClose={search.clearAnswer}
              onFollowUp={search.followUp}
              onOpenConversation={search.openConversation}
            />
          </div>
        ) : (
          <p className='px-4 py-6 text-center text-sm text-muted-foreground'>
            {asking ? t('search.askHint') : t('search.hint')}
          </p>
        )}
      </div>
    </CommandRoot>
  );
}

/**
 * 搜索 in the sidebar, right under 工作台: not a page but the dialog, so it
 * is drawn here like a navigation link rather than declared as a route.
 */
export function SearchNavButton({
  collapsed,
  onOpen,
}: {
  readonly collapsed: boolean;
  /** Also closes the mobile sidebar, which would cover the dialog. */
  readonly onOpen?: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const search = useGlobalSearch();
  if (!search) return null;
  const label = t('navigation.search');
  return (
    <button
      type='button'
      title={collapsed ? `${label} (${SHORTCUT})` : undefined}
      aria-label={label}
      onClick={() => {
        onOpen?.();
        search.setOpen(true);
      }}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring ${collapsed ? 'md:justify-center md:px-2' : ''}`}
    >
      <span className='flex size-4 shrink-0 items-center justify-center [&_svg]:size-4'>
        <Search />
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-left ${collapsed ? 'md:hidden' : ''}`}
      >
        {label}
      </span>
      <kbd
        className={`shrink-0 font-sans text-xs text-muted-foreground ${collapsed ? 'md:hidden' : ''}`}
      >
        {SHORTCUT}
      </kbd>
    </button>
  );
}

/**
 * The same search drawn as a search field, for a page that wants it in
 * reach beside its title — the workbench, where most work starts by
 * looking something up. It is a button, not an input: typing happens in the
 * dialog it opens, which is the one the sidebar's 搜索 and ⌘K open.
 */
export function SearchTrigger({
  className,
}: {
  readonly className?: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const search = useGlobalSearch();
  if (!search) return null;
  return (
    <button
      type='button'
      aria-label={t('navigation.search')}
      onClick={() => {
        search.setOpen(true);
      }}
      className={cn(
        'flex h-8 w-72 max-w-full items-center gap-2 rounded-lg border border-input bg-background px-2.5 text-sm text-muted-foreground shadow-xs transition-colors outline-none hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <Search aria-hidden='true' className='size-4 shrink-0' />
      <span className='min-w-0 flex-1 truncate text-left'>
        {t('search.placeholder')}
      </span>
      <kbd className='shrink-0 font-sans text-xs'>{SHORTCUT}</kbd>
    </button>
  );
}

/** `text` with each occurrence of `term` in bold, ignoring case. */
function Highlight({
  text: value,
  term,
}: {
  readonly text: string;
  readonly term: string;
}): ReactElement {
  if (!term) return <>{value}</>;
  const lower = value.toLowerCase();
  const needle = term.toLowerCase();
  const parts: ReactElement[] = [];
  let from = 0;
  for (
    let at = lower.indexOf(needle);
    at !== -1;
    at = lower.indexOf(needle, from)
  ) {
    if (at > from)
      parts.push(<span key={`t${from}`}>{value.slice(from, at)}</span>);
    parts.push(
      <mark
        key={`m${at}`}
        className='bg-transparent font-semibold text-foreground'
      >
        {value.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
  }
  if (from < value.length)
    parts.push(<span key={`t${from}`}>{value.slice(from)}</span>);
  return <>{parts}</>;
}
