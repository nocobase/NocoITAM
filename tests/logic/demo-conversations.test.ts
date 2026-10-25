// @vitest-environment node
import { databaseManagerToken } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { numberingServiceToken } from '../../server/providers/index.js';
import type { CommentInput } from '../../server/providers/itam/comments.js';
import { demoDate } from '../../server/providers/itam/demo-conversations.js';
import { createDemoService } from '../../server/providers/itam/demo.js';
import { deviceSyncServiceToken } from '../../server/providers/itam/device-sync.js';
import {
  auditServiceToken,
  deviceServiceToken,
  disposalServiceToken,
  entitlementServiceToken,
  masterDataServiceToken,
  procurementServiceToken,
  repairServiceToken,
  stockServiceToken,
} from '../../server/providers/itam/index.js';
import { planServiceToken } from '../../server/providers/itam/plans.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

it('writes a date placeholder in each form the answers use', () => {
  expect(demoDate('date', 7, '2026-10-24')).toBe('2026-10-31');
  expect(demoDate('md', 8, '2026-10-24')).toBe('11-01');
  expect(demoDate('mon', 8, '2026-10-24')).toBe('Nov 1');
  expect(demoDate('monfy', -24, '2026-10-24')).toBe('September 30, 2026');
  expect(demoDate('dmonf', 0, '2026-10-24')).toBe('24 October');
  expect(demoDate('dmony', 70, '2026-10-24')).toBe('2 Jan 2027');
});

describe('the demo’s Asset Steward conversations', () => {
  let app: TestApp;
  const binding = {
    onlineAgent: {
      version: 1,
      kind: 'realtime',
      config: {
        scope: [],
        systemPrompt: 'You are Asset Steward.',
        tool: [],
        skill: [],
        toolVersions: {},
        model: ['deepseek/deepseek-flash'],
        agentId: 'online',
      },
      call: null,
    },
  };

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    // The Agents plugin's tables, as far as the demo writes them; the test
    // database has only ITAM's own.
    const builder = app.db.database.connection().builder;
    await builder.createCollection('agConversations', (c) => {
      c.string('id', { length: 64 }).primary().notNull();
      for (const name of [
        'userId',
        'agentId',
        'mode',
        'modelService',
        'model',
        'fallbackFromAgentId',
        'title',
        'titleSource',
        'category',
        'source',
        'syncRunId',
      ])
        c.string(name, { length: 255 }).nullable();
      c.boolean('read').nullable();
      c.boolean('showInChatList').nullable();
      for (const name of ['thread', 'lastSeq', 'syncSeq'])
        c.integer(name).nullable();
      for (const name of [
        'lastMessageAt',
        'archivedAt',
        'lockedAt',
        'createdAt',
        'updatedAt',
      ])
        c.string(name, { length: 64 }).nullable();
      c.json('metadata').nullable();
    });
    await builder.createCollection('agConversationMessages', (c) => {
      c.string('id', { length: 64 }).primary().notNull();
      c.string('conversationId', { length: 64 }).notNull();
      c.integer('seq').notNull();
      c.string('role', { length: 32 }).notNull();
      c.json('content').notNull();
      c.text('searchText').nullable();
      for (const name of [
        'toolCalls',
        'attachments',
        'workContext',
        'metadata',
      ])
        c.json(name).nullable();
      c.string('runId', { length: 64 }).nullable();
      c.integer('runEventSeq').nullable();
      c.string('createdAt', { length: 64 }).nullable();
      c.string('updatedAt', { length: 64 }).nullable();
    });
  });

  afterEach(async () => {
    await app.destroy();
  });

  const demoService = (withAgents: boolean) => {
    const resolve = app.container.resolve.bind(app.container);
    let created = 0;
    let ids = 0;
    return createDemoService({
      database: resolve(databaseManagerToken),
      masterData: resolve(masterDataServiceToken),
      devices: resolve(deviceServiceToken),
      stock: resolve(stockServiceToken),
      entitlements: resolve(entitlementServiceToken),
      procurement: resolve(procurementServiceToken),
      repairs: resolve(repairServiceToken),
      audits: resolve(auditServiceToken),
      disposals: resolve(disposalServiceToken),
      numbering: resolve(numberingServiceToken),
      deviceSync: resolve(deviceSyncServiceToken),
      comments: {
        add: async (_actor: string, _input: CommentInput) =>
          ({ id: `comment-${String((ids += 1))}` }) as never,
        edit: async () => ({}) as never,
        remove: async () => undefined,
        subjectOf: async () => ({ subjectType: '', subjectId: '' }),
      },
      accounts: {
        create: async () => `staff-${String((created += 1))}`,
        remove: async () => undefined,
        describe: async () => ({ name: 'Staff', email: 'staff@example.com' }),
        grant: async () => null,
        revoke: async () => undefined,
      },
      conversations: {
        plans: resolve(planServiceToken),
        binding: async () => (withAgents ? binding : null),
        nextId: () => String(900_000_000 + (ids += 1)),
      },
    });
  };
  const rows = async (table: string) =>
    (await app.db.database
      .query()
      .selectFrom(table)
      .selectAll()
      .execute()) as Record<string, unknown>[];

  // The register's currency, which the seeds set to dollars here.
  const currency = async (code: string) => {
    const query = app.db.database.query();
    const row = await query
      .selectFrom('itamSettings')
      .select('value')
      .where('key', '=', 'general')
      .executeTakeFirst<{ value: unknown }>();
    const value = (
      typeof row?.value === 'string' ? JSON.parse(row.value) : row?.value
    ) as Record<string, unknown>;
    await query
      .updateTable('itamSettings')
      .set({ value: { ...value, currency: code } })
      .where('key', '=', 'general')
      .execute();
  };

  for (const [language, code] of [
    ['en-US', 'USD'],
    ['zh-CN', 'CNY'],
  ] as const)
    it(`gives the importer every ${language} conversation and its plans, the staff theirs, and clears them`, async () => {
      await currency(code);
      const demo = demoService(true);
      await demo.generate('mia', language);

      const conversations = await rows('agConversations');
      const byOwner = (userId: string) =>
        conversations.filter((row) => row.userId === userId).length;
      expect(byOwner('mia')).toBe(6);
      // The approving manager, the one who writes the records, the support
      // desk.
      expect(byOwner('staff-1')).toBe(1);
      expect(byOwner('staff-2')).toBe(1);
      expect(byOwner('staff-3')).toBe(2);
      // The fixture's first, the leaver's with its plan, is the newest, so
      // it heads the list and ✨ opens it.
      const newest = conversations
        .filter((row) => row.userId === 'mia')
        .sort((a, b) =>
          String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)),
        )[0];
      expect(conversations[0]).toMatchObject({
        source: 'panel',
        mode: 'online',
        modelService: 'deepseek',
        model: 'deepseek-flash',
      });

      // Every placeholder filled: no `{{…}}`, and no record key left where
      // an id should be.
      const messages = await rows('agConversationMessages');
      expect(messages.length).toBeGreaterThanOrEqual(20);
      const text = JSON.stringify(messages);
      expect(text).not.toMatch(/\{\{/);
      expect(text).not.toMatch(/"(device|person|seat|stockItem):/);

      // The importer's two plans wait on their conversations, for longer
      // than a plan the assistant proposes.
      const plans = await rows('itamPlans');
      expect(plans.some((plan) => plan.conversationId === newest?.id)).toBe(
        true,
      );
      expect(plans).toHaveLength(2);
      for (const plan of plans) {
        expect(plan.proposerUserId).toBe('mia');
        expect(plan.status).toBe('pending');
        expect(
          conversations.some((row) => row.id === plan.conversationId),
        ).toBe(true);
        expect(new Date(String(plan.expiresAt)).getTime()).toBeGreaterThan(
          Date.now() + 300 * 86_400_000,
        );
      }

      await demo.clear('mia');
      expect(await rows('agConversations')).toEqual([]);
      expect(await rows('agConversationMessages')).toEqual([]);
      expect(await rows('itamPlans')).toEqual([]);
      expect(await rows('itamPlanSteps')).toEqual([]);
    }, 120_000);

  it('writes none without the Agents plugin, or in another currency than the answers', async () => {
    const without = demoService(false);
    await without.generate('mia', 'en-US');
    expect(await rows('agConversations')).toEqual([]);
    await without.clear('mia');

    // The Chinese answers were given in yuan; the register is in dollars.
    const demo = demoService(true);
    await demo.generate('mia', 'zh-CN');
    expect(await rows('agConversations')).toEqual([]);
  }, 120_000);
});
