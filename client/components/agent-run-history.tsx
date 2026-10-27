/**
 * One step of an agent's run, presented: a line per message, tool call or status change, expandable to its detail.
 * The chat draws a run's live steps and a consultation's transcript with it (`RunTranscriptRow`). Purely
 * presentational: the consumer gives the events. Every word comes from `labels`, English by default; `{name}`-style
 * placeholders are filled in here.
 *
 * Application change (ITAM, 2026-10-27): the Agents plugin's UI Library item also carried the run history panel, its
 * dialogs, the live pill and the run header; this application uses only the transcript row, so the rest was removed.
 */
import { ChevronRightIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Badge } from '#components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#components/ui/collapsible';
import { cn } from 'cn';

/** Puts `values` into a label's `{name}` placeholders. */
function fillLabel(
  text: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return text.replace(/\{(\w+)\}/gu, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** An event of a run's transcript, as an agent runner reports it. */
export interface RunTranscriptEvent {
  readonly seq: number;
  readonly at: string;
  readonly type: string;
  readonly content?: string | undefined;
  readonly tool?: string | undefined;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly meta?: Readonly<Record<string, unknown>> | undefined;
  readonly truncated?: boolean | undefined;
}

export interface RunTranscriptLabels {
  readonly waiting: string;
  readonly empty: string;
  readonly fetchFailed: string;
  readonly expand: string;
  readonly truncated: string;
  readonly events: string;
  /** `{count}` inputs. */
  readonly inputDelivered: string;
  /** `{input}` and `{output}` tokens. */
  readonly tokens: string;
  readonly kinds: Readonly<
    Record<
      | 'text'
      | 'thinking'
      | 'toolUse'
      | 'toolResult'
      | 'allowed'
      | 'denied'
      | 'input'
      | 'checkout'
      | 'status'
      | 'error'
      | 'usage',
      string
    >
  >;
}

const defaultRunTranscriptLabels: RunTranscriptLabels = {
  waiting: 'Waiting for the agent to start…',
  empty: 'This run recorded no events.',
  fetchFailed: 'Unable to fetch new events. Retrying…',
  expand: 'Show all',
  truncated: 'Cut short: the full text was too long to keep.',
  events: 'Run transcript',
  inputDelivered: '{count} input(s) delivered to the agent',
  tokens: '{input} tokens in, {output} out',
  kinds: {
    text: 'Agent',
    thinking: 'Thinking',
    toolUse: 'Tool',
    toolResult: 'Result',
    allowed: 'Allowed',
    denied: 'Denied',
    input: 'Input',
    checkout: 'Checkout',
    status: 'Status',
    error: 'Error',
    usage: 'Usage',
  },
};

function plainText(text: string): ReactNode {
  return <p className='text-sm whitespace-pre-wrap wrap-anywhere'>{text}</p>;
}

const PREVIEW_LIMIT = 280;

function stringify(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2) ?? '';
  } catch {
    return '';
  }
}

function metaText(event: RunTranscriptEvent, key: string): string | null {
  const value = event.meta?.[key];
  return typeof value === 'string' && value ? value : null;
}

function metaNumber(event: RunTranscriptEvent, key: string): number | null {
  const value = event.meta?.[key];
  return typeof value === 'number' ? value : null;
}

function firstLine(text: string): string {
  const line = text.trim().split('\n', 1)[0] ?? '';
  return line.length > 200 ? `${line.slice(0, 199)}…` : line;
}

/** The one line that says what a tool call did: the shell command, or the file, pattern, URL or query it was about. */
function toolSummary(input: unknown): string | null {
  if (typeof input === 'string') return firstLine(input) || null;
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const command = record.command ?? record.cmd;
  if (typeof command === 'string' && command.trim())
    return `$ ${firstLine(command)}`;
  if (
    Array.isArray(command) &&
    command.every((part) => typeof part === 'string')
  ) {
    const parts: readonly string[] = command;
    const script =
      parts.length === 3 &&
      /^(ba|z)?sh$/u.test(parts[0] ?? '') &&
      (parts[1] ?? '').startsWith('-')
        ? (parts[2] ?? '')
        : parts.join(' ');
    return script.trim() ? `$ ${firstLine(script)}` : null;
  }
  for (const key of [
    'file_path',
    'filePath',
    'path',
    'pattern',
    'url',
    'query',
    'description',
  ]) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return firstLine(value);
  }
  return null;
}

function CodeBlock({
  text,
  expand,
  preview: showPreview = true,
}: {
  readonly text: string;
  readonly expand: string;
  /** Show the text's start beside the toggle; off when a summary line above already says it. */
  readonly preview?: boolean;
}): ReactElement | null {
  if (!text) return null;
  if (text.length <= PREVIEW_LIMIT && !text.includes('\n'))
    return (
      <pre className='font-mono text-xs leading-5 whitespace-pre-wrap wrap-anywhere text-muted-foreground'>
        {text}
      </pre>
    );
  // The whole text on one line, so a preview never stops at a lone "{" or a blank first line.
  const preview = text.replace(/\s+/gu, ' ').trim().slice(0, PREVIEW_LIMIT);
  return (
    <Collapsible>
      <CollapsibleTrigger className='group flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-sm text-left text-xs leading-5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'>
        <ChevronRightIcon
          className='size-3.5 shrink-0 transition-transform group-data-panel-open:rotate-90'
          aria-hidden='true'
        />
        {showPreview ? (
          <span className='min-w-0 flex-1 truncate font-mono group-data-panel-open:hidden'>
            {preview}
          </span>
        ) : null}
        <span className='shrink-0 font-medium group-data-panel-open:hidden'>
          {expand}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className='mt-1 max-h-96 overflow-auto rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap wrap-anywhere'>
          {text}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

const KIND_TONE: Readonly<Record<string, string>> = {
  blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  grey: 'bg-muted text-muted-foreground',
  violet: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  red: 'bg-red-500/10 text-red-700 dark:text-red-300',
  green: 'bg-green-500/10 text-green-700 dark:text-green-300',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  slate: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
};

function Kind({
  tone,
  children,
}: {
  readonly tone: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Badge
      data-size='sm'
      variant='secondary'
      className={cn('font-normal', KIND_TONE[tone])}
    >
      {children}
    </Badge>
  );
}

export interface RunTranscriptRowProps {
  readonly event: RunTranscriptEvent;
  /** How an agent's text is drawn; plain text by default. */
  readonly renderMarkdown?: (text: string) => ReactNode;
  readonly locale?: string | undefined;
  readonly labels?: RunTranscriptLabels;
}

/**
 * One event of a transcript as a list item (`<li>`), for a list of one's own, such as the steps of a run in progress:
 * a kind label, the content in the form that suits it, then its number and time.
 */
export function RunTranscriptRow({
  event,
  renderMarkdown,
  locale,
  labels = defaultRunTranscriptLabels,
}: RunTranscriptRowProps): ReactElement {
  const markdown = renderMarkdown ?? plainText;
  let label: ReactElement;
  let body: ReactNode;
  switch (event.type) {
    case 'text':
      label = <Kind tone='blue'>{labels.kinds.text}</Kind>;
      body = markdown(event.content ?? '');
      break;
    case 'thinking':
      label = <Kind tone='grey'>{labels.kinds.thinking}</Kind>;
      body = (
        <p className='text-sm whitespace-pre-wrap wrap-anywhere text-muted-foreground italic'>
          {event.content}
        </p>
      );
      break;
    case 'toolUse': {
      label = <Kind tone='violet'>{event.tool ?? labels.kinds.toolUse}</Kind>;
      const summary = toolSummary(event.input ?? event.content);
      body = (
        <>
          {summary ? (
            <p className='font-mono text-xs leading-5 whitespace-pre-wrap wrap-anywhere'>
              {summary}
            </p>
          ) : null}
          <CodeBlock
            text={stringify(event.input ?? event.content)}
            expand={labels.expand}
            preview={!summary}
          />
        </>
      );
      break;
    }
    case 'toolResult':
      label = <Kind tone='grey'>{event.tool ?? labels.kinds.toolResult}</Kind>;
      body = (
        <CodeBlock
          text={stringify(event.output ?? event.content)}
          expand={labels.expand}
        />
      );
      break;
    case 'permission': {
      const denied = metaText(event, 'decision') === 'deny';
      label = (
        <Kind tone={denied ? 'red' : 'green'}>
          {denied ? labels.kinds.denied : labels.kinds.allowed}
        </Kind>
      );
      const reason = metaText(event, 'reason');
      const summary = toolSummary(event.input);
      body = (
        <p className='text-sm wrap-anywhere'>
          <span className='font-medium'>{event.tool ?? '—'}</span>
          {summary ? (
            <span className='ml-2 font-mono text-xs'>{summary}</span>
          ) : null}
          {reason ? (
            <span className='block text-xs text-muted-foreground'>
              {reason}
            </span>
          ) : null}
        </p>
      );
      break;
    }
    case 'input': {
      label = <Kind tone='amber'>{labels.kinds.input}</Kind>;
      const ids = event.meta?.inputIds;
      body = (
        <div className='space-y-1'>
          {event.content ? markdown(event.content) : null}
          <p className='text-xs text-muted-foreground'>
            {fillLabel(labels.inputDelivered, {
              count: Array.isArray(ids) ? ids.length : 1,
            })}
          </p>
        </div>
      );
      break;
    }
    case 'usage': {
      label = <Kind tone='slate'>{labels.kinds.usage}</Kind>;
      const input = metaNumber(event, 'inputTokens');
      const output = metaNumber(event, 'outputTokens');
      body = (
        <p className='text-xs leading-5 text-muted-foreground'>
          {input !== null || output !== null
            ? fillLabel(labels.tokens, {
                input: input ?? 0,
                output: output ?? 0,
              })
            : event.content}
        </p>
      );
      break;
    }
    case 'checkout':
      label = <Kind tone='slate'>{labels.kinds.checkout}</Kind>;
      body = (
        <p className='font-mono text-xs leading-5 wrap-anywhere text-muted-foreground'>
          {event.content}
        </p>
      );
      break;
    case 'error':
      label = <Kind tone='red'>{labels.kinds.error}</Kind>;
      body = (
        <p className='text-sm whitespace-pre-wrap wrap-anywhere text-destructive'>
          {event.content ?? stringify(event.output)}
        </p>
      );
      break;
    default:
      label = <Kind tone='grey'>{labels.kinds.status}</Kind>;
      body = (
        <p className='text-xs leading-5 text-muted-foreground'>
          {event.content}
        </p>
      );
  }
  const at = parse(event.at);
  return (
    <li
      data-type={event.type}
      className={cn(
        'grid grid-cols-[5rem_minmax(0,1fr)_auto] items-start gap-x-3 border-b px-4 py-2 last:border-b-0',
        event.type === 'status' && 'py-1.5',
      )}
    >
      {/* The pill, the content's first line and the meta share one 20px line box. */}
      <div className='flex h-5 min-w-0 items-center [&>*]:max-w-full [&>*]:truncate'>
        {label}
      </div>
      <div className='min-w-0 space-y-1'>
        {body}
        {event.truncated ? (
          <p className='text-xs text-muted-foreground'>{labels.truncated}</p>
        ) : null}
      </div>
      <div className='flex h-5 shrink-0 items-center gap-1 text-xs whitespace-nowrap text-muted-foreground tabular-nums'>
        <span className='text-muted-foreground/70'>#{event.seq}</span>
        <span aria-hidden='true'>·</span>
        <time dateTime={event.at}>
          {at
            ? new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }).format(
                at,
              )
            : '—'}
        </time>
      </div>
    </li>
  );
}
