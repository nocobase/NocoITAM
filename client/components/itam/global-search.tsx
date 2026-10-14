import { useTranslation } from '@nocobase/i18n/client';
import { Command as CommandRoot } from 'cmdk';
import { ArrowRight, Search, Sparkles } from 'lucide-react';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from 'react';
import { useNavigate } from 'react-router';

import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useItamAi } from '@/lib/itam/ai-chat';
import { useOpenRecord } from '@/lib/itam/record-drawer';
import {
  SEARCH_PAGES,
  searchRowDetail,
  searchRowTitle,
  useSearchResults,
} from '@/lib/itam/search';

/** The shortcut as the reader's keyboard labels it. */
const SHORTCUT =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    ? '⌘K'
    : 'Ctrl K';

type Mode = 'search' | 'ask';

interface GlobalSearch {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly value: string;
  readonly setValue: (value: string) => void;
  readonly mode: Mode;
  readonly setMode: (mode: Mode) => void;
  /** Asks the assistant in its panel, and closes the search. */
  readonly ask: (text: string) => void;
}

const GlobalSearchContext = createContext<GlobalSearch | undefined>(undefined);

/**
 * The search the sidebar opens (2026-10-05), after InvGate's: one box over
 * every list the reader may read, in two modes.
 *
 * - **Search** answers as it is typed, without a model: matches grouped by
 *   the list they belong to, the first few each, opening in the record
 *   drawer; a group's last row opens its list searched for the same words.
 * - **Ask AI** hands the sentence to the assistant in its chat panel, on a
 *   new conversation (template 1.0.0-beta.64, after NocoCRM's): the answer
 *   is a conversation the reader can go on with, and the records it names
 *   are links there. Until then the answer came in this dialog, from an
 *   unseen chat with a page tool of its own; the Agents plugin's chat has
 *   no page tools.
 *
 * The state lives here, around the whole shell, so the box keeps what was
 * typed while it is closed. What each reader finds is still what their
 * grants let them read, which the server decides group by group.
 */
export function GlobalSearchProvider({
  children,
}: PropsWithChildren): ReactElement {
  const { t } = useTranslation();
  const ai = useItamAi();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<Mode>('search');

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

  const search: GlobalSearch = {
    open,
    setOpen,
    value,
    setValue,
    mode,
    setMode,
    ask: (text) => {
      if (!ai.available || !text) return;
      setOpen(false);
      setValue('');
      ai.ask(t('ai.prompts.globalSearch', { text }));
    },
  };

  return (
    <GlobalSearchContext.Provider value={search}>
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
  const { value, setValue, mode, setMode } = search;
  const asking = mode === 'ask' && Boolean(ai.available);
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
            {asking ? <Sparkles className='text-primary' /> : <Search />}
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
          {ai.available ? (
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
                    <Sparkles className='text-primary' />
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
            {ai.available ? (
              // Words the register does not contain may still be a
              // question: one step from here to asking it.
              <CommandGroup>
                <CommandItem
                  value='ask-noco'
                  className='text-primary'
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
        ) : (
          <p className='px-4 py-6 text-center text-sm text-muted-foreground'>
            {asking ? t('search.askHint') : t('search.hint')}
          </p>
        )}
      </div>
    </CommandRoot>
  );
}

// Application change (ITAM, 2026-10-14): 搜索 is not a page but the dialog,
// so it is drawn in the sidebar rather than declared as a route. It sits
// beside the brand, as NocoCRM has it (AppSidebar's `action`), with its
// shortcut on hover; in the phone's sheet it closes the sheet first, which
// would cover the dialog.
export function SearchHeaderButton(): ReactElement | null {
  const { t } = useTranslation();
  const search = useGlobalSearch();
  const { isMobile, setOpenMobile } = useSidebar();
  if (!search) return null;
  const label = t('navigation.search');
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            // The menu's own colour, in a box larger than the icon for the
            // hover's ground, pulled back by its margin.
            className='-m-1 size-7 rounded-md p-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            onClick={() => {
              if (isMobile) setOpenMobile(false);
              search.setOpen(true);
            }}
            size='icon-sm'
            variant='ghost'
          />
        }
      >
        <Search />
      </TooltipTrigger>
      <TooltipContent side='bottom'>
        {isMobile ? label : `${label} · ${SHORTCUT}`}
      </TooltipContent>
    </Tooltip>
  );
}

// The collapsed sidebar has no room beside its mark, so there the search is
// an entry of the menu under the workbench (NavigationMenu's `after`), with
// the same tooltip as the pages around it.
export function SearchNavButton(): ReactElement | null {
  const { t } = useTranslation();
  const search = useGlobalSearch();
  const { isMobile, state } = useSidebar();
  if (!search || isMobile || state !== 'collapsed') return null;
  const label = t('navigation.search');
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={`${label} (${SHORTCUT})`}
        onClick={() => search.setOpen(true)}
      >
        <Search />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
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
