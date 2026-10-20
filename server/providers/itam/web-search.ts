import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import type { ServiceResolver } from '@nocobase/service-provider';

import { BusinessRuleError } from './errors.js';

/**
 * Searching and reading the web (2026-10-20), through DeepSeek's Search and
 * Fetch APIs (`POST /v1/tools/search`, `/v1/tools/fetch`, launched
 * 2026-10-17; https://api-docs.deepseek.com/guides/search). They take the
 * key of a DeepSeek model service of the Agents plugin — the default chat
 * model's service when it is DeepSeek's, else the first enabled one — read
 * through `models.services.connectionFor`, so there is nothing more to
 * configure; with no such service there is no web search. Asset Steward
 * calls them as tools (`itam_web_search`, `itam_web_fetch`), and AI 整理 of
 * a model or software product searches before it fills the form
 * (`ai-reading.ts`). Each successful call is billed by DeepSeek (about
 * $0.75 per 1,000); what comes back is data, never instructions.
 */

const DEEPSEEK_ORIGIN = 'https://api.deepseek.com';
const TIMEOUT_MS = 20_000;
/** The longest page text handed on, in characters. */
export const PAGE_TEXT_MAX = 20_000;

export interface WebResult {
  readonly title: string;
  readonly url: string;
  readonly site: string | null;
  /** When the page was published, RFC 3339; null when unknown. */
  readonly date: string | null;
  /** 0–4, the higher the more authoritative; -1 unknown. */
  readonly authority: number;
  readonly summary: string;
  /** The page's text, when asked for and available. */
  readonly content?: string;
}

export interface WebPage {
  readonly title: string;
  readonly content: string;
}

interface Access {
  readonly origin: string;
  readonly apiKey: string;
}

/** The DeepSeek service whose key the calls use, or null when there is none. */
async function access(container: ServiceResolver): Promise<Access | null> {
  if (!container.has(agentsToken)) return null;
  const services = container.resolve(agentsToken).models.services;
  try {
    const usable = (await services.list()).filter(
      (service) =>
        service.enabled &&
        service.provider === 'deepseek' &&
        service.apiKeySet &&
        service.models.some((model) => model.kind === 'chat'),
    );
    if (!usable.length) return null;
    const chat = (await services.defaults()).effectiveChat;
    const service =
      usable.find((item) => item.name === chat?.modelService) ?? usable[0];
    const model = service.models.find((item) => item.kind === 'chat');
    if (!model) return null;
    const connection = await services.connectionFor({
      modelService: service.name,
      model: model.value,
    });
    if (!connection.apiKey) return null;
    let origin = DEEPSEEK_ORIGIN;
    try {
      if (connection.baseUrl) origin = new URL(connection.baseUrl).origin;
    } catch {
      // A base URL that does not parse: DeepSeek's own.
    }
    return { origin, apiKey: connection.apiKey };
  } catch {
    return null;
  }
}

/** Whether the web can be searched: a DeepSeek service is there. */
export async function webSearchAvailable(
  container: ServiceResolver,
): Promise<boolean> {
  return (await access(container)) !== null;
}

/** What a refused call means, for the model or the person to act on. */
function failure(status: number, message: string): BusinessRuleError {
  const reason =
    status === 402
      ? 'The DeepSeek account has no balance left for web search'
      : status === 429
        ? 'Web search is busy; try again in a moment'
        : status === 401
          ? 'The DeepSeek API key was refused'
          : status === 403 || status === 404
            ? 'That page could not be read'
            : message || `Web search failed (${String(status)})`;
  return new BusinessRuleError(reason, 'WEB_SEARCH_FAILED');
}

async function call<T>(
  container: ServiceResolver,
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const target = await access(container);
  if (!target)
    throw new BusinessRuleError(
      'Web search needs a DeepSeek model service (Agent 团队 → 模型)',
      'WEB_SEARCH_UNAVAILABLE',
    );
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const response = await fetch(`${target.origin}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${target.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  }).catch((error: unknown) => {
    throw new BusinessRuleError(
      error instanceof Error && error.name === 'TimeoutError'
        ? 'Web search timed out'
        : 'Web search could not be reached',
      'WEB_SEARCH_FAILED',
    );
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: unknown };
  } | null;
  if (!response.ok)
    throw failure(
      response.status,
      typeof payload?.error?.message === 'string' ? payload.error.message : '',
    );
  return payload as T;
}

const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';
const orNull = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : null;

/**
 * Searches the web for `query` (at most 128 characters; `site:`, `lang:`,
 * `after:` and the other operators work), the most relevant first.
 */
export async function searchWeb(
  container: ServiceResolver,
  query: string,
  options: {
    readonly count?: number;
    /** Each page's text too, cut to `contentMax` characters. */
    readonly content?: boolean;
    readonly contentMax?: number;
    readonly signal?: AbortSignal;
  } = {},
): Promise<WebResult[]> {
  const q = query.replace(/\s+/g, ' ').trim().slice(0, 128);
  if (!q) return [];
  const answer = await call<{ results?: unknown }>(
    container,
    '/v1/tools/search',
    {
      query: q,
      count: Math.min(Math.max(options.count ?? 8, 1), 50),
      need_content: Boolean(options.content),
    },
    options.signal,
  );
  const rows = Array.isArray(answer?.results) ? answer.results : [];
  return rows
    .map((row: Record<string, unknown>) => ({
      row,
      score: typeof row.rerank_score === 'number' ? row.rerank_score : 0,
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ row }): WebResult => {
      const content = text(row.content);
      return {
        title: text(row.title),
        url: text(row.url),
        site: orNull(row.site_name),
        date: orNull(row.date),
        authority: typeof row.authority === 'number' ? row.authority : -1,
        summary: text(row.summary) || text(row.snippet),
        ...(options.content && content
          ? { content: content.slice(0, options.contentMax ?? PAGE_TEXT_MAX) }
          : {}),
      };
    })
    .filter((row) => row.url);
}

/** One page's title and text (Markdown), cut to `PAGE_TEXT_MAX`. */
export async function fetchPage(
  container: ServiceResolver,
  url: string,
  signal?: AbortSignal,
): Promise<WebPage> {
  const answer = await call<{ title?: unknown; content?: unknown }>(
    container,
    '/v1/tools/fetch',
    { url },
    signal,
  );
  return {
    title: text(answer?.title),
    content: text(answer?.content).slice(0, PAGE_TEXT_MAX),
  };
}
