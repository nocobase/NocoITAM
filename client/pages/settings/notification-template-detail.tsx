// A notification template's drawer (/settings/notifications/templates/
// :templateId), in place of the Notification plugin's block's detail
// section under its cards: when the notification is sent, to whom, on what
// conditions and in which language, its channels, its variables, and its
// preview from made-up data in a language the reader picks, the interface's
// own at first (`GET /api/notifications/templates/:id`, `POST …/preview`).
// Application change, 2026-11-10, as NocoCRM has it.
import { useApiClient } from '@nocobase/app-client';
import type {
  NotificationTemplatePreview,
  NotificationTemplateView,
} from '@nocobase/app-plugin-notification/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactElement, type ReactNode } from 'react';
import { useParams } from 'react-router';

import { RouteDrawer } from '#components/route-drawer';
import { Badge } from '#components/ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';

import { useAdminText } from './common/hooks.js';
import { LoadFailure } from './common/shared.js';
import {
  NOTIFICATION_TEMPLATES_KEY,
  useTemplateText,
} from './notification-template-text.js';

export default function NotificationTemplateDrawer(): ReactElement {
  const { t } = useTranslation();
  const { text } = useAdminText();
  const words = useTemplateText();
  const { templateId = '' } = useParams();
  const api = useApiClient();
  const template = useQuery({
    queryKey: [...NOTIFICATION_TEMPLATES_KEY, templateId],
    queryFn: () =>
      api
        .request<{ data: NotificationTemplateView }>({
          path: `notifications/templates/${encodeURIComponent(templateId)}`,
        })
        .then((result) => result.data),
    retry: false,
  });
  const view = template.data;
  return (
    <RouteDrawer
      title={view ? words.name(view) : t('settings.notificationTemplates')}
      description={
        view
          ? [
              words.category(view.category),
              ...view.channels.map((entry) => words.channelType(entry.type)),
            ].join(' · ')
          : undefined
      }
    >
      {template.error && !view ? (
        <LoadFailure
          error={template.error}
          what={text('notificationTemplates.whatOne')}
          onRetry={() => void template.refetch()}
        />
      ) : !view ? (
        <DetailSkeleton />
      ) : (
        <div className='flex flex-col gap-6'>
          <Particulars view={view} />
          <Preview view={view} />
        </div>
      )}
    </RouteDrawer>
  );
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section className='flex flex-col gap-1.5'>
      <h3 className='text-sm font-medium'>{title}</h3>
      <div className='text-sm text-muted-foreground'>{children}</div>
    </section>
  );
}

function Particulars({
  view,
}: {
  readonly view: NotificationTemplateView;
}): ReactElement {
  const { text } = useAdminText();
  const words = useTemplateText();
  const state = (key: string) =>
    text(`notificationTemplates.channelState.${key}`);
  return (
    <div className='flex flex-col gap-5'>
      <Section title={text('notificationTemplates.when')}>
        {words.trigger(view)}
      </Section>
      <Section title={text('notificationTemplates.who')}>
        {words.recipients(view)}
      </Section>
      <Section title={text('notificationTemplates.conditions')}>
        <ul className='flex list-disc flex-col gap-1 pl-4'>
          {words.conditions(view).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Section>
      <Section title={text('notificationTemplates.language')}>
        {words.language(view)}
      </Section>
      <Section title={text('notificationTemplates.channels')}>
        <ul className='flex flex-col gap-1.5'>
          {view.channels.map((entry) => (
            <li key={entry.name} className='flex flex-wrap items-center gap-2'>
              <span className='text-foreground'>
                {words.channelType(entry.type)}
              </span>
              <Badge variant={entry.configured ? 'secondary' : 'outline'}>
                {state(entry.configured ? 'configured' : 'unconfigured')}
              </Badge>
              <Badge variant={entry.enabled ? 'secondary' : 'outline'}>
                {state(
                  entry.enabled === null
                    ? 'unknown'
                    : entry.enabled
                      ? 'enabled'
                      : 'disabled',
                )}
              </Badge>
            </li>
          ))}
        </ul>
        <p className='mt-1.5 text-xs'>
          {text('notificationTemplates.channelsHint')}
        </p>
      </Section>
      {view.variables.length ? (
        <Section title={text('notificationTemplates.variables')}>
          <dl className='flex flex-col gap-2'>
            {view.variables.map((variable) => (
              <div key={variable.name}>
                <dt className='font-mono text-xs text-foreground'>{`{{${variable.name}}}`}</dt>
                <dd>
                  {words.variable(view, variable.name, variable.description)}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}
      <Section title={text('notificationTemplates.source')}>
        {words.contributor(view.contributor)}
      </Section>
    </div>
  );
}

// The interface's language when the template renders in it, else the first
// it lists (the application's default language for ITAM's, en-US for the
// invitation).
function initialLocale(locales: readonly string[], language: string): string {
  return (
    locales.find((locale) => locale === language) ??
    locales.find((locale) => locale.split('-')[0] === language.split('-')[0]) ??
    locales[0] ??
    'en-US'
  );
}

function Preview({
  view,
}: {
  readonly view: NotificationTemplateView;
}): ReactElement {
  const { text, language } = useAdminText();
  const words = useTemplateText();
  const api = useApiClient();
  // A message in every language at once reads the same in each: no picker,
  // a line saying so instead.
  const allLanguages = words.allLanguages(view);
  const [locale, setLocale] = useState(() =>
    initialLocale(view.locales, language),
  );
  const preview = useQuery({
    queryKey: [...NOTIFICATION_TEMPLATES_KEY, view.id, 'preview', locale],
    queryFn: () =>
      api
        .request<{ data: NotificationTemplatePreview }>({
          path: `notifications/templates/${encodeURIComponent(view.id)}/preview`,
          method: 'POST',
          json: { locale },
        })
        .then((result) => result.data),
    retry: false,
  });
  const languageName = (code: string): string => {
    try {
      return (
        new Intl.DisplayNames([language], { type: 'language' }).of(code) ?? code
      );
    } catch {
      return code;
    }
  };
  const items = view.locales.map((code) => ({
    value: code,
    label: languageName(code),
  }));
  return (
    <section className='flex flex-col gap-3 border-t pt-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <h3 className='text-sm font-medium'>
          {text('notificationTemplates.preview')}
        </h3>
        {allLanguages ? null : (
          <Select
            items={items}
            value={locale}
            onValueChange={(next) => next && setLocale(String(next))}
          >
            <SelectTrigger
              aria-label={text('notificationTemplates.previewLanguage')}
              className='w-auto min-w-36'
            >
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
        )}
      </div>
      <div className='flex flex-col gap-1 text-xs text-muted-foreground'>
        {allLanguages ? (
          <p>{text('notificationTemplates.previewAllLanguages')}</p>
        ) : null}
        <p>{text('notificationTemplates.synthetic')}</p>
      </div>
      {preview.error && !preview.data ? (
        <LoadFailure
          error={preview.error}
          what={text('notificationTemplates.preview')}
          onRetry={() => void preview.refetch()}
        />
      ) : !preview.data ? (
        <Skeleton className='h-24 w-full' />
      ) : (
        <div className='flex flex-col gap-4'>
          <Content
            label={text('notificationTemplates.example')}
            content={preview.data.content}
            htmlLabel={text('notificationTemplates.html')}
          />
          <Content
            label={text('notificationTemplates.definition')}
            content={preview.data.definition}
            htmlLabel={text('notificationTemplates.html')}
            muted
          />
        </div>
      )}
    </section>
  );
}

function Content({
  label,
  content,
  htmlLabel,
  muted = false,
}: {
  readonly label: string;
  readonly content: NotificationTemplatePreview['content'];
  readonly htmlLabel: string;
  readonly muted?: boolean;
}): ReactElement {
  return (
    <div className='flex flex-col gap-1.5'>
      <span className='text-xs text-muted-foreground'>{label}</span>
      <div
        className={`flex flex-col gap-1 rounded-lg border p-3 text-sm ${muted ? 'bg-muted/40' : 'bg-card'}`}
      >
        <p className='font-medium break-words'>{content.title}</p>
        <p className='break-words whitespace-pre-wrap text-muted-foreground'>
          {content.body}
        </p>
      </div>
      {content.html ? (
        <details className='text-xs'>
          <summary className='cursor-pointer text-muted-foreground'>
            {htmlLabel}
          </summary>
          <pre className='mt-1.5 max-h-64 overflow-auto rounded-lg bg-muted p-3 break-all whitespace-pre-wrap'>
            {content.html}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function DetailSkeleton(): ReactElement {
  const { text } = useAdminText();
  return (
    <div
      role='status'
      aria-label={text('common.loading')}
      className='flex flex-col gap-5'
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className='flex flex-col gap-2'>
          <Skeleton className='h-4 w-24' />
          <Skeleton className='h-4 w-full' />
        </div>
      ))}
    </div>
  );
}
