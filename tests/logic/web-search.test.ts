// @vitest-environment node
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { ServiceContainer } from '@nocobase/service-provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchPage,
  PAGE_TEXT_MAX,
  searchWeb,
  webSearchAvailable,
} from '../../server/providers/itam/web-search.js';
import { aiRoutes } from '../../server/routes/itam/ai.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

// What the model was asked, and its answer: a model reading citing one page
// the search found and one it did not.
const model = vi.hoisted(() => ({ asked: [] as string[] }));
vi.mock('../../server/providers/itam/ai-model.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../server/providers/itam/ai-model.js')
  >()),
  openSession: async () => ({
    model: { modelService: 'deepseek', model: 'deepseek-flash' },
    ask: async () => '',
    askJson: async (content: string) => {
      model.asked.push(content);
      return {
        reading: {
          name: 'OptiPlex 7010 SFF',
          manufacturerName: 'Dell',
          warrantyMonths: 36,
          sources: [
            { title: 'Dell', url: 'https://www.dell.com/optiplex-7010' },
            { title: 'Made up', url: 'https://example.com/invented' },
          ],
        },
        said: 'Check the category.',
      };
    },
  }),
  readSkill: async () => '',
}));

/** The Agents plugin as the web search reads it: one DeepSeek service, or none. */
function agentsWith(provider: string) {
  return {
    models: {
      services: {
        list: async () => [
          {
            name: 'main',
            title: 'Main',
            provider,
            baseUrl: null,
            apiKeySet: true,
            enabled: true,
            models: [{ kind: 'chat', value: 'chat-1', label: 'Chat' }],
          },
        ],
        defaults: async () => ({
          chat: null,
          effectiveChat: { modelService: 'main', model: 'chat-1' },
        }),
        connectionFor: async () => ({
          provider,
          baseUrl: null,
          apiKey: 'test-key',
        }),
      },
    },
  };
}

type Call = { url: string; init: RequestInit };
let calls: Call[];
let answer: { status: number; body: unknown };

beforeEach(() => {
  calls = [];
  answer = { status: 200, body: {} };
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
    });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Searching the web (2026-10-20) through DeepSeek's Search and Fetch APIs,
 * with the key of the Agents plugin's DeepSeek model service.
 */
describe('web search', () => {
  const container = (provider: string) => {
    const services = new ServiceContainer();
    services.instance(agentsToken, agentsWith(provider) as never);
    return services;
  };

  it('needs a DeepSeek model service', async () => {
    expect(await webSearchAvailable(container('openai'))).toBe(false);
    await expect(searchWeb(container('openai'), 'Dell')).rejects.toMatchObject({
      rule: 'WEB_SEARCH_UNAVAILABLE',
    });
    expect(calls).toEqual([]);
    expect(await webSearchAvailable(container('deepseek'))).toBe(true);
  });

  it('searches with the service key, the most relevant first', async () => {
    answer.body = {
      results: [
        { title: 'Blog', url: 'https://blog.example/a', rerank_score: 0.9 },
        {
          title: 'Dell',
          url: 'https://www.dell.com/optiplex-7010',
          rerank_score: 2.1,
          summary: 'OptiPlex 7010 SFF, 3-year warranty.',
          content: 'x'.repeat(100),
          authority: 4,
          site_name: 'Dell',
        },
      ],
    };
    const results = await searchWeb(
      container('deepseek'),
      '  Dell   OptiPlex ',
      {
        count: 3,
        content: true,
        contentMax: 10,
      },
    );
    expect(calls[0].url).toBe('https://api.deepseek.com/v1/tools/search');
    expect(new Headers(calls[0].init.headers).get('authorization')).toBe(
      'Bearer test-key',
    );
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      query: 'Dell OptiPlex',
      count: 3,
      need_content: true,
    });
    expect(results.map((row) => row.title)).toEqual(['Dell', 'Blog']);
    expect(results[0]).toMatchObject({
      site: 'Dell',
      authority: 4,
      summary: 'OptiPlex 7010 SFF, 3-year warranty.',
      content: 'x'.repeat(10),
    });
  });

  it('reads a page, cut to its limit, and says why one could not be read', async () => {
    answer.body = { title: 'Spec', content: 'y'.repeat(PAGE_TEXT_MAX + 5) };
    const page = await fetchPage(container('deepseek'), 'https://dell.com/x');
    expect(calls[0].url).toBe('https://api.deepseek.com/v1/tools/fetch');
    expect(page.content).toHaveLength(PAGE_TEXT_MAX);

    answer = { status: 402, body: { error: { message: 'balance' } } };
    await expect(
      searchWeb(container('deepseek'), 'Dell'),
    ).rejects.toMatchObject({ rule: 'WEB_SEARCH_FAILED' });
  });
});

describe('AI 整理 of a model, with the web', () => {
  let app: TestApp;

  beforeEach(async () => {
    model.asked = [];
    app = await createTestApp({ seeds: true });
    app.container.instance(agentsToken, agentsWith('deepseek') as never);
    await app.mount(aiRoutes);
  });
  afterEach(async () => {
    await app.destroy();
  });

  it('hands the model what the search found, and keeps only the sources it found', async () => {
    answer.body = {
      results: [
        {
          title: 'Dell',
          url: 'https://www.dell.com/optiplex-7010',
          rerank_score: 2,
          summary: 'OptiPlex 7010 SFF',
        },
      ],
    };
    const response = await app.request('/api/itam/ai/read', {
      ...json({
        task: 'model',
        material: 'Dell OptiPlex 7010 SFF',
        context: { categories: [] },
        language: 'en-US',
      }),
      user: 'mia',
      role: 'manager',
    });
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: { reading: { sources: { url: string }[] }; searched: boolean };
    };
    expect(data.searched).toBe(true);
    expect(data.reading.sources.map((source) => source.url)).toEqual([
      'https://www.dell.com/optiplex-7010',
    ]);
    expect(model.asked[0]).toContain('"web":[');
    expect(model.asked[0]).toContain('This time you can use the web');
  });
});
