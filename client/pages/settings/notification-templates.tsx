// Application change (the template renders the Notification plugin's
// `NotificationTemplates` block here; 2026-11-10, as NocoCRM has it): ITAM's
// own page over the plugin's API (`GET /api/notifications/templates`), so
// that the directory reads in the reader's language
// (notification-template-text.ts), filters with the application's select,
// groups the templates by category, opens a template in a drawer
// (notification-template-detail.tsx, `:templateId`) from anywhere on its
// card, and names channels and categories in words. The plugin's API checks
// the page grant `notification.templates` the route declares. The heading is
// the view's own, as the template's page has it.
import { resolveListState, useApiClient } from '@nocobase/app-client';
import type {
  NotificationTemplateText,
  NotificationTemplateView,
} from '@nocobase/app-plugin-notification/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { BellIcon, SearchIcon } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useSearchParams,
} from 'react-router';

import { ListFeedback } from '#components/list-feedback';
import { Badge } from '#components/ui/badge';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';

import { useAdminText } from './common/hooks.js';
import { SettingsModulePage } from './settings-module-page.js';
import {
  NOTIFICATION_TEMPLATES_KEY,
  templateTextKey,
  useTemplateText,
  type TemplateText,
} from './notification-template-text.js';

const ALL = 'all';

export default function NotificationTemplatesPage(): ReactElement {
  const { t } = useTranslation();
  const { text } = useAdminText();
  const words = useTemplateText();
  const api = useApiClient();
  const location = useLocation();
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(ALL);
  const [channel, setChannel] = useState(ALL);

  const query = useQuery({
    queryKey: NOTIFICATION_TEMPLATES_KEY,
    queryFn: () =>
      api
        .request<{ data: NotificationTemplateView[] }>({
          path: 'notifications/templates',
        })
        .then((result) => result.data),
    retry: false,
  });
  const templates = useMemo(() => query.data ?? [], [query.data]);

  // Each category once, by its registered text's identity, with that text for its label.
  const categories = useMemo(() => {
    const entries = new Map<string, NotificationTemplateText>();
    for (const view of templates)
      entries.set(templateTextKey(view.category), view.category);
    return [...entries];
  }, [templates]);
  const channelTypes = useMemo(
    () => [
      ...new Set(
        templates.flatMap((view) => view.channels.map((entry) => entry.type)),
      ),
    ],
    [templates],
  );
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return templates.filter(
      (view) =>
        (category === ALL || templateTextKey(view.category) === category) &&
        (channel === ALL ||
          view.channels.some((entry) => entry.type === channel)) &&
        (!needle ||
          [words.name(view), words.trigger(view), words.recipients(view)]
            .join(' ')
            .toLowerCase()
            .includes(needle)),
    );
  }, [templates, category, channel, search, words]);

  // A link from before the drawer, `?template=<id>`, opens that drawer.
  const legacy = params.get('template');
  if (legacy) {
    const rest = new URLSearchParams(params);
    rest.delete('template');
    const others = rest.toString();
    return (
      <Navigate
        to={{
          pathname: encodeURIComponent(legacy),
          search: others ? `?${others}` : '',
        }}
        replace
      />
    );
  }

  const filtered = search.trim() !== '' || category !== ALL || channel !== ALL;
  const state = resolveListState(
    {
      data: query.data,
      error: query.error,
      isPending: query.isPending,
      isFetching: query.isFetching,
    },
    visible.length,
    filtered,
  );

  return (
    <SettingsModulePage
      title={t('settings.notificationTemplates')}
      description={text('notificationTemplates.intro')}
    >
      <div className='flex flex-col gap-6'>
        <div className='flex flex-wrap items-end gap-3'>
          <InputGroup className='w-full sm:w-64'>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={text('notificationTemplates.searchPlaceholder')}
              aria-label={text('notificationTemplates.search')}
            />
          </InputGroup>
          <Filter
            label={text('notificationTemplates.category')}
            all={text('notificationTemplates.all')}
            value={category}
            onChange={setCategory}
            options={categories.map(([value, label]) => ({
              value,
              label: words.category(label),
            }))}
          />
          <Filter
            label={text('notificationTemplates.channel')}
            all={text('notificationTemplates.all')}
            value={channel}
            onChange={setChannel}
            options={channelTypes.map((value) => ({
              value,
              label: words.channelType(value),
            }))}
          />
        </div>
        <ListFeedback
          state={state}
          empty={
            <Empty className='min-h-48 border border-dashed'>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <BellIcon />
                </EmptyMedia>
                <EmptyTitle>{text('notificationTemplates.empty')}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          }
        >
          <div className='flex flex-col gap-6'>
            {categories
              .filter(([key]) =>
                visible.some((view) => templateTextKey(view.category) === key),
              )
              .map(([key, label]) => (
                <section key={key} aria-label={words.category(label)}>
                  <h2 className='mb-3 text-sm font-medium text-muted-foreground'>
                    {words.category(label)}
                  </h2>
                  <ul className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
                    {visible
                      .filter((view) => templateTextKey(view.category) === key)
                      .map((view) => (
                        <li key={view.id} className='min-w-0'>
                          <TemplateCard
                            view={view}
                            words={words}
                            to={{
                              pathname: encodeURIComponent(view.id),
                              search: location.search,
                            }}
                          />
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
          </div>
        </ListFeedback>
      </div>
      <Outlet />
    </SettingsModulePage>
  );
}

function TemplateCard({
  view,
  words,
  to,
}: {
  readonly view: NotificationTemplateView;
  readonly words: TemplateText;
  readonly to: { readonly pathname: string; readonly search: string };
}): ReactElement {
  return (
    <Link
      to={to}
      className='flex h-full flex-col gap-2 rounded-lg border bg-card p-4 transition-colors outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/50'
    >
      <div className='flex items-start justify-between gap-3'>
        <h3 className='font-medium'>{words.name(view)}</h3>
        <div className='flex shrink-0 flex-wrap justify-end gap-1'>
          {view.channels.map((entry) => (
            <Badge key={entry.name} variant='outline'>
              {words.channelType(entry.type)}
            </Badge>
          ))}
        </div>
      </div>
      <p className='line-clamp-2 text-sm text-muted-foreground'>
        {words.trigger(view)}
      </p>
    </Link>
  );
}

function Filter({
  label,
  all,
  value,
  onChange,
  options,
}: {
  readonly label: string;
  readonly all: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly { value: string; label: string }[];
}): ReactElement {
  const items = [{ value: ALL, label: all }, ...options];
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => onChange(next ? String(next) : ALL)}
    >
      <SelectTrigger aria-label={label} className='w-auto min-w-36'>
        <span className='text-muted-foreground'>{label}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className='w-auto min-w-(--anchor-width)'>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
