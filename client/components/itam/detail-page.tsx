import type { LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';

import { Card, CardContent } from '@/components/ui/card';
import { TAB_ICONS } from '@/lib/itam/tab-icons';
import { cn } from '@/lib/utils';

import { EditableTitle } from './editable-title.js';
import { StatCards, type StatCard } from './stat-cards.js';

export interface DetailTab {
  readonly key: string;
  readonly label: ReactNode;
  /** Relative path under the detail route. */
  readonly to: string;
  readonly count?: number;
  /** Leads the label; by default the one `TAB_ICONS` keeps for the key. */
  readonly icon?: LucideIcon;
}

export interface SummaryItem {
  readonly key: string;
  readonly label: ReactNode;
  readonly value: ReactNode;
}

export interface TitleEdit {
  /** The editable part of the title. */
  readonly value: string;
  /** Fixed text before it, e.g. the device number. */
  readonly prefix?: ReactNode;
  readonly onSave: (value: string) => Promise<void>;
  readonly editable?: boolean;
}

export interface DetailPageProps {
  readonly title: ReactNode;
  /** When set, the title edits in place (one click) and `title` is the fallback. */
  readonly titleEdit?: TitleEdit;
  readonly subtitle?: ReactNode;
  readonly breadcrumb?: ReactNode;
  readonly actions?: ReactNode;
  /** Shown above the header, e.g. an inspection notice. */
  readonly notice?: ReactNode;
  readonly summary?: readonly SummaryItem[];
  /** Clickable counts under the header (a master-data record's footprint). */
  readonly stats?: readonly StatCard[];
  /** Left column content: grouped fields. */
  readonly info: ReactNode;
  /** Small print under the information column, e.g. created / updated. */
  readonly footnote?: ReactNode;
  /** Rendered in the right column above the tabs, e.g. a field template editor. */
  readonly aside?: ReactNode;
  /**
   * `narrow` keeps the information column at a fixed width so related
   * records get the room; configuration-style records with few fields use it.
   */
  /**
   * `narrow` keeps a third for the fields; `reversed` also puts the
   * related side (aside + tabs) first, with the fields on the right.
   */
  readonly layout?: 'default' | 'narrow' | 'reversed';
  readonly tabs: readonly DetailTab[];
  /** The active tab's content, normally an <Outlet />. */
  readonly children: ReactNode;
}

/** Header + summary strip + information column + tabbed related records. */
export function DetailPage({
  title,
  titleEdit,
  subtitle,
  breadcrumb,
  actions,
  notice,
  summary,
  stats,
  info,
  footnote,
  aside,
  layout = 'default',
  tabs,
  children,
}: DetailPageProps): ReactElement {
  const location = useLocation();
  return (
    <>
      {/* Breakpoints follow the page's own width (container queries), not
          the window's: the same page shown in the record drawer lays out
          like a narrow screen. */}
      {/* pb-24: room at the foot for the ask box floating over the page
          (assistant-dock.tsx). */}
      <section className='@container mx-auto w-full max-w-7xl space-y-6 p-6 pb-24'>
        {notice}
        {/* The actions sit beside the title when both fit on one line and
            wrap below it when the title is too long — decided by the
            title's own length, not by a breakpoint, so a short title keeps
            its actions beside it in the narrow record drawer too. The title
            block's basis is its natural width, which is what the line break
            is decided on; it still shrinks and wraps once on a line alone. */}
        <header className='flex flex-wrap items-start justify-between gap-x-4 gap-y-3'>
          <div className='min-w-0 flex-[1_1_auto] space-y-1'>
            {breadcrumb || subtitle ? (
              <div className='flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted-foreground'>
                {breadcrumb}
                {breadcrumb && subtitle ? (
                  <span aria-hidden='true'>·</span>
                ) : null}
                {subtitle ? <span>{subtitle}</span> : null}
              </div>
            ) : null}
            <div className='flex min-w-0 items-center gap-2'>
              {titleEdit ? (
                <EditableTitle
                  value={titleEdit.value}
                  prefix={titleEdit.prefix}
                  onSave={titleEdit.onSave}
                  editable={titleEdit.editable}
                />
              ) : (
                <h1 className='truncate font-heading text-2xl font-semibold tracking-tight'>
                  {title}
                </h1>
              )}
            </div>
          </div>
          {actions ? (
            <div className='flex shrink-0 flex-wrap items-center gap-2'>
              {actions}
            </div>
          ) : null}
        </header>
        {summary && summary.length > 0 ? (
          <Card className='py-0'>
            {/* One line of "label value" pairs, spaced apart rather than
              split by marks. Each item takes the width its value needs. */}
            <CardContent className='p-4'>
              <dl className='flex flex-wrap items-center gap-x-10 gap-y-3'>
                {summary.map((item) => (
                  <div
                    key={item.key}
                    className='flex min-w-0 max-w-full items-center gap-2 text-sm leading-6'
                  >
                    <dt className='shrink-0 text-muted-foreground'>
                      {item.label}
                    </dt>
                    <dd className='flex min-w-0 items-center font-medium break-words text-foreground'>
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ) : null}
        {stats && stats.length > 0 ? <StatCards cards={stats} /> : null}
        <div
          className={cn(
            'grid gap-6',
            // Configuration-style records keep a third for their fields.
            layout === 'narrow'
              ? '@4xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]'
              : layout === 'reversed'
                ? '@4xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'
                : '@4xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]',
          )}
        >
          <div
            className={cn('space-y-6', layout === 'reversed' && '@4xl:order-2')}
          >
            {info}
            {footnote ? (
              <div className='px-1 text-xs text-muted-foreground'>
                {footnote}
              </div>
            ) : null}
          </div>
          <div
            className={cn('space-y-4', layout === 'reversed' && '@4xl:order-1')}
          >
            {aside}
            {/* The tabs sit on a card like the information column, on every
              detail page, so the two sides read as one. */}
            <TabsFrame>
              {/* NocoCRM's record tabs (DetailTabBar): underlined on a thin
                  rule, the open tab in the foreground over a 2px line of it,
                  the others muted until hovered, each led by its icon and
                  followed by its count in plain muted figures. The first
                  tab's text lines up with the content below. */}
              <nav
                className='flex w-full flex-wrap gap-x-5 border-b border-border'
                aria-label='tabs'
              >
                {tabs.map((tab) => {
                  const Icon = tab.icon ?? TAB_ICONS[tab.key];
                  return (
                    <NavLink
                      key={tab.key}
                      to={{ pathname: tab.to, search: location.search }}
                      className={({ isActive }) =>
                        cn(
                          '-mb-px flex h-10 items-center gap-1.5 border-b-2 text-sm font-medium transition-colors outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
                          isActive
                            ? 'border-foreground text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground',
                        )
                      }
                    >
                      {Icon ? (
                        <Icon aria-hidden='true' className='size-4' />
                      ) : null}
                      {tab.label}
                      {tab.count !== undefined ? (
                        <span className='text-xs text-muted-foreground tabular-nums'>
                          {tab.count}
                        </span>
                      ) : null}
                    </NavLink>
                  );
                })}
              </nav>
              {/* An empty tab says so in a shorter box than an empty list
                  page: the tab is one of several on a page. */}
              <div className='[&_[data-slot=empty-state]]:py-6'>{children}</div>
            </TabsFrame>
          </div>
        </div>
      </section>
    </>
  );
}

/** On configuration-style pages the tabs sit on a card like the fields do. */
function TabsFrame({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Card className='py-0'>
      <CardContent className='space-y-4 p-4'>{children}</CardContent>
    </Card>
  );
}

/** A single information card with the same sections used by master data. */
export function InfoCard({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Card className='py-0'>
      <CardContent className='space-y-5 p-4'>{children}</CardContent>
    </Card>
  );
}

export function InfoSection({
  title,
  action,
  children,
}: {
  readonly title: ReactNode;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section>
      {/* A primary-colored bar marks each group and a rule closes its
          heading, so the eye finds the sections of a long card. */}
      <div className='mb-2 flex min-h-9 flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2'>
        <h2 className='flex shrink-0 items-center gap-2 font-heading text-sm font-semibold'>
          <span
            aria-hidden='true'
            className='h-3.5 w-1 shrink-0 rounded-full bg-primary'
          />
          {title}
        </h2>
        {action}
      </div>
      <dl className='grid gap-2'>{children}</dl>
    </section>
  );
}

export function InfoRow({
  label,
  children,
}: {
  readonly label: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start gap-3 text-sm'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='min-w-0'>{children}</dd>
    </div>
  );
}
