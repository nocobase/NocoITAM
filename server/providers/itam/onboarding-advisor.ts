import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceContainer,
  type ServiceToken,
} from '@nocobase/service-provider';
import { z } from 'zod';

import { aiAvailable, modelFailure, openSession } from './ai-model.js';
import { asText, type Row } from './collection-query.js';
import {
  isJoiner,
  type AdvisedLine,
  type OnboardingPlan,
  type OnboardingService,
} from './onboarding.js';
import type { SettingsService } from './settings.js';

/**
 * Asset Steward choosing a joiner's equipment in the background (2026-10-06): the
 * first thing the assistant does with nobody watching, which reverses the
 * 2026-09-27 rule that nothing AI runs outside a conversation.
 *
 * The plan (`onboarding.ts`) already knows what a joiner needs and what in
 * stock fits; a rule picks among identical laptops by place and warranty.
 * What it cannot weigh is the rest — the one with three repairs behind it,
 * the one due for replacement next spring, what the business notes say
 * designers get — and that is what Asset Steward is asked: for each item, which of
 * the candidates and why. It runs **as the joiner's 入职负责人**, under that
 * person's grants and in a conversation of theirs, reading only (the tools
 * it may call are listed below and every one is `ALLOW`, so the run never
 * pauses for a confirmation nobody is there to give). It writes nothing but
 * its own row: the plan puts its picks first while they are still free, and
 * the 入职负责人 reserves or changes them on the card. Agent does the work,
 * a person decides (guideline 3.3).
 *
 * A run starts only when the 入职负责人 asks for one on the card (挑选 /
 * 重新建议), for a joiner not yet equipped, with an owner, and with
 * something to choose — some item with more candidates than it needs. It
 * ran on every save and nightly too until 2026-10-06, which spent a model
 * run on joiners nobody had looked at yet and held their picks back from
 * the others. It is switched off by the 入职建议 setting, and nothing
 * happens while no model is usable.
 */

export type ConsiderResult =
  | { readonly started: true; readonly runId: string }
  | {
      readonly started: false;
      readonly reason:
        | 'disabled'
        | 'unavailable'
        | 'notJoiner'
        | 'noOwner'
        | 'nothingToChoose'
        | 'running';
    };

export interface OnboardingAdvisor {
  /** Starts a run for a joiner, asked by their 入职负责人; never waits for it. */
  advise(personId: string): Promise<ConsiderResult>;
  /** Settles once every run started so far has finished. */
  idle(): Promise<void>;
}

export const onboardingAdvisorToken: ServiceToken<OnboardingAdvisor> =
  createServiceToken<OnboardingAdvisor>('itam/onboarding-advisor');

/** What Asset Steward answers: its picks per item, and a line about the whole. */
export const ADVICE_SCHEMA = z.object({
  items: z
    .array(
      z.object({
        line: z.string().describe('The item’s `line` key, as given.'),
        picks: z
          .array(
            z.object({
              id: z.string().describe('A candidate’s id, as given.'),
              reason: z
                .string()
                .describe('One sentence: why this one over the others.'),
            }),
          )
          .describe('As many candidates as the item’s `missing`, best first.'),
      }),
    )
    .describe('One entry per item listed.'),
  summary: z
    .string()
    .describe('One or two sentences for the 入职负责人 about the choice.'),
});
export type AdviceAnswer = z.infer<typeof ADVICE_SCHEMA>;

/** One unattended run of Asset Steward, as the advisor needs it. */
export interface AgentRunner {
  /** Whether a model is usable and Asset Steward is enabled. */
  available(): Promise<boolean>;
  run(input: {
    readonly actorId: string;
    readonly title: string;
    /** How to choose: the agent's whole system prompt. */
    readonly instructions: string;
    /** The joiner and their candidates, as the message. */
    readonly prompt: string;
    readonly timezone: string;
    readonly locale: string;
  }): Promise<AdviceAnswer>;
}

/** A run that did not finish, with what to show for it. */
export class AdviceFailure extends Error {}

/** How long one run may take before it is called off. */
const RUN_TIMEOUT_MS = 5 * 60_000;

/**
 * The Agents plugin's model gateway behind `AgentRunner` (template
 * 1.0.0-beta.64): one session with Asset Steward's model, this job's instructions as
 * its system prompt and the joiner with their candidates as the question,
 * answered as JSON in `ADVICE_SCHEMA`'s shape (`openSession` in
 * ai-model.ts). There is no conversation: the run's row is the record, and
 * a call outside a conversation has no tools and no skills to wander into —
 * which is what the AI employee plugin's agent had to be kept from
 * (2026-10-06). No model is unavailable.
 */
export function createAssistantRunner(
  container: ServiceContainer,
): AgentRunner {
  return {
    available: () => aiAvailable(container),
    async run(input) {
      const session = await openSession(container, {
        timeZone: input.timezone,
        system: input.instructions,
      });
      if (!session) throw new AdviceFailure('No model to ask');
      try {
        const answer = await session.askJson(
          input.prompt,
          ADVICE_SCHEMA,
          AbortSignal.timeout(RUN_TIMEOUT_MS),
        );
        if (!answer) throw new AdviceFailure('The assistant gave no answer');
        return answer;
      } catch (error) {
        if (error instanceof AdviceFailure) throw error;
        throw new AdviceFailure(modelFailure(error).message);
      }
    },
  };
}

/** What the prompt is written in, per deployment language. */
const PROMPTS: Readonly<
  Record<string, { title: (name: string) => string; ask: string }>
> = {
  'zh-CN': {
    title: (name) => `入职配备建议：${name}`,
    ask: [
      '你是 IT 资产管理系统里的资产管家，在后台为一位新人从库存里挑选入职配备。没有人在看，你只做这一件事。用户消息是一段 JSON：新人、他的配置、业务说明，以及要挑的各项和候选。',
      '',
      '- 只回答 items 列出的项。每一项从它的 candidates 里挑出 missing 个（不够就全挑），每个写一句理由。',
      '- 返回的 line 和 id 必须原样取自 JSON；不在 candidates 里的不算数，会被丢弃。',
      '- 需要知道的都在 JSON 里。不要提问，不要建议其他型号或采购；缺口和采购不归你管。',
      '- businessNotes 是管理员写的业务说明，里面对部门或职位的偏好要遵守。',
      '',
      '怎么挑：',
      '- 设备：优先和新人同地点（sameLocationAsJoiner）；避开维修多的（repairs）、一年内要更换的（plannedReplacementDate）、备注里写了毛病的（notes）；保修剩得长的更好（warrantyEndDate）。带 returnedBy 和 availableOn 的是离职人员会归还的设备，availableOn 起才能用；同等条件下优先在库的。',
      '- 配件、耗材：优先同地点、库存多的那条记录。',
      '- 软件授权：订阅优先自动续订、离到期远的；永久授权优先维保还在的；试用的不挑，除非只剩它。',
      '- 理由写和其他候选的差别，不写共性；候选都一样时写「与其他候选无差别，按地点就近」。提到候选时用它的 label（设备编号和名称），不要写 id。',
      '- summary 一两句，写给他的入职负责人：挑了几样、有没有要注意的。理由和总结用简体中文。',
    ].join('\n'),
  },
  'en-US': {
    title: (name) => `Onboarding suggestions: ${name}`,
    ask: [
      'You are Asset Steward, the assistant of an IT asset management system, choosing onboarding equipment from stock for one joiner in the background. Nobody is watching and this is the only thing to do. The user message is JSON: the joiner, their kit, the business notes, and the items to choose for with their candidates.',
      '',
      '- Answer only the items listed under `items`. For each, pick `missing` of its `candidates` (all of them when there are fewer), each with one sentence of reason.',
      '- Copy every `line` and `id` exactly from the JSON; anything not among the candidates is discarded.',
      '- Everything you need is in the JSON. Ask no question and suggest no other model or purchase; shortfalls and purchasing are not yours.',
      "- `businessNotes` are the administrator's business notes; follow any preference they state for the department or position.",
      '',
      'How to choose:',
      "- Devices: prefer the joiner's own location (sameLocationAsJoiner); avoid ones often repaired (repairs), due for replacement within a year (plannedReplacementDate) or with a fault in their notes; a longer warranty is better (warrantyEndDate). One with `returnedBy` and `availableOn` is a device somebody leaving will hand back, usable from `availableOn`; other things equal, prefer one in stock.",
      '- Accessories and consumables: prefer the record at their location with the most on hand.',
      '- Software: for a subscription prefer auto-renewing and furthest from its end; for a perpetual licence one still under maintenance; not a trial unless it is the only one.',
      '- Give the reason as how it differs from the other candidates, not what they share; when they are all alike, say so and that the nearest was taken. Name a candidate by its `label` (device number and name), never by its id.',
      '- `summary`: one or two sentences for their onboarding owner — what was chosen and anything to watch. Write in English.',
    ].join('\n'),
  },
};

/** The items Asset Steward has a choice on: more candidates than it needs. */
const choices = (plan: OnboardingPlan) =>
  plan.lines.filter(
    (line) =>
      line.missing > 0 &&
      (line.candidates?.length ?? 0) > 0 &&
      // Stock is a quantity from one or more records: a choice once there
      // is more than one record. A device or seat is one per pick.
      (line.candidates?.length ?? 0) >
        (line.kind === 'stock' ? 1 : line.missing),
  );

/**
 * Asset Steward's answer held to the question: each pick a candidate of its own item,
 * none taken twice, no more than the item needs. Whatever else it said is
 * dropped rather than trusted.
 */
export function validAdvice(
  plan: OnboardingPlan,
  answer: AdviceAnswer,
): AdvisedLine[] {
  const taken = new Set<string>();
  const advised: AdvisedLine[] = [];
  for (const item of answer.items) {
    const line = plan.lines.find((candidate) => candidate.key === item.line);
    if (!line?.candidates) continue;
    const allowed = new Set(line.candidates.map((candidate) => candidate.id));
    const limit = line.kind === 'stock' ? line.candidates.length : line.missing;
    const picks: { id: string; reason: string }[] = [];
    for (const pick of item.picks) {
      if (picks.length >= limit) break;
      const id = String(pick.id);
      if (!allowed.has(id) || taken.has(`${line.kind}:${id}`)) continue;
      taken.add(`${line.kind}:${id}`);
      picks.push({ id, reason: String(pick.reason ?? '').slice(0, 300) });
    }
    if (picks.length > 0) advised.push({ line: line.key, picks });
  }
  return advised;
}

/** A run left `running` by a process that stopped is over after this. */
const STALE_MS = 15 * 60_000;

export function createOnboardingAdvisor(deps: {
  readonly database: DatabaseManager;
  readonly onboarding: OnboardingService;
  readonly settings: SettingsService;
  readonly runner: AgentRunner;
  readonly locale: () => string;
  /** Told when a run finished, so open pages refresh the card. */
  readonly touched?: () => void;
  readonly log?: (message: string, error: unknown) => void;
}): OnboardingAdvisor {
  const { database, onboarding, settings, runner } = deps;
  const q = () => database.query();
  const active = new Set<string>();
  let queue: Promise<void> = Promise.resolve();

  const finish = async (
    runId: string,
    values: Readonly<Record<string, unknown>>,
  ) => {
    const now = new Date();
    await q()
      .updateTable('onboardingRuns')
      .set({ ...values, updatedAt: now, finishedAt: now })
      .where('id', '=', runId)
      .execute();
  };

  const execute = async (runId: string, person: Row, ownerId: string) => {
    const personId = String(person.id);
    try {
      const plan = await onboarding.plan(personId, { candidates: true });
      if (!plan) throw new AdviceFailure('The person no longer exists');
      const items = choices(plan);
      const names = async (table: string, id: unknown) =>
        asText(id)
          ? (asText(
              (
                await q()
                  .selectFrom(table)
                  .select(['name'])
                  .where('id', '=', String(id))
                  .executeTakeFirst<Row>()
              )?.name,
            ) ?? null)
          : null;
      const locale = deps.locale();
      const prompt = PROMPTS[locale] ?? PROMPTS['en-US'];
      const question = {
        joiner: {
          id: personId,
          name: String(person.name),
          department: await names('departments', person.departmentId),
          position: asText(person.position) ?? null,
          location: await names('locations', person.locationId),
          hireDate: asText(person.hireDate) ?? null,
        },
        kit: plan.kit?.name ?? null,
        businessNotes: (await settings.get('ai')).businessNotes || null,
        items: items.map((line) => ({
          line: line.key,
          item: line.target.name,
          kind: line.kind,
          missing: line.missing,
          candidates: line.candidates,
        })),
      };
      const answer = await runner.run({
        actorId: ownerId,
        title: prompt.title(String(person.name)),
        instructions: prompt.ask,
        prompt: JSON.stringify(question, null, 2),
        timezone: (await settings.get('general')).timeZone,
        locale,
      });
      const suggestions = validAdvice(plan, answer);
      // An answer that kept nothing is not advice, whatever its summary says:
      // shown as chosen, it would describe picks the card does not have.
      if (suggestions.length === 0)
        throw new AdviceFailure('The answer named none of the candidates');
      await finish(runId, {
        status: 'ready',
        suggestions,
        summary: answer.summary.slice(0, 1000),
      });
    } catch (error) {
      deps.log?.('Onboarding advice failed', error);
      await finish(runId, {
        status: 'failed',
        failure: (error instanceof Error ? error.message : String(error)).slice(
          0,
          1000,
        ),
      }).catch(() => undefined);
    } finally {
      active.delete(runId);
      deps.touched?.();
    }
  };

  const advise: OnboardingAdvisor['advise'] = async (personId) => {
    const switches = await settings.get('ai');
    if (switches.onboardingAdvice === false)
      return { started: false, reason: 'disabled' };
    if (!(await runner.available()))
      return { started: false, reason: 'unavailable' };
    const person = await q()
      .selectFrom('people')
      .select([
        'id',
        'name',
        'departmentId',
        'position',
        'locationId',
        'hireDate',
        'employmentStatus',
        'onboardingOwnerId',
        'onboardingCompletedAt',
        'createdAt',
      ])
      .where('id', '=', personId)
      .executeTakeFirst<Row>();
    const hireDate = asText(person?.hireDate);
    // Joiners — entered around their first day — not yet equipped, however
    // far off that day is (2026-10-06: it waited for the fortnight 入职准备
    // lists, which left the owner of a joiner a month out nothing to ask).
    if (
      !person ||
      asText(person.employmentStatus) === 'left' ||
      !hireDate ||
      !isJoiner(hireDate, person.createdAt) ||
      asText(person.onboardingCompletedAt)
    )
      return { started: false, reason: 'notJoiner' };
    const ownerId = asText(person.onboardingOwnerId);
    if (!ownerId) return { started: false, reason: 'noOwner' };

    const plan = await onboarding.plan(personId, { candidates: true });
    if (!plan || choices(plan).length === 0)
      return { started: false, reason: 'nothingToChoose' };

    const inputs = [
      hireDate,
      asText(person.departmentId) ?? '',
      asText(person.position) ?? '',
      ownerId,
      plan.kit?.id ?? '',
    ].join('|');
    const latest = await q()
      .selectFrom('onboardingRuns')
      .select(['id', 'status', 'createdAt'])
      .where('personId', '=', personId)
      .orderBy('createdAt', 'desc')
      .executeTakeFirst<Row>();
    if (latest?.status === 'running') {
      const age = Date.now() - new Date(String(latest.createdAt)).getTime();
      if (active.has(String(latest.id)) || age < STALE_MS)
        return { started: false, reason: 'running' };
      // Left running by a process that stopped.
      await finish(String(latest.id), {
        status: 'failed',
        failure: 'Interrupted',
      });
    }

    const runId = crypto.randomUUID();
    const at = new Date();
    await q()
      .insertInto('onboardingRuns')
      .values({
        id: runId,
        personId,
        actorId: ownerId,
        trigger: 'manual',
        status: 'running',
        inputs,
        createdAt: at,
        updatedAt: at,
      })
      .execute();
    active.add(runId);
    // One at a time: owners asking for ten joiners at once get ten runs in
    // a row, not ten models at once.
    queue = queue.then(() => execute(runId, person, ownerId));
    return { started: true, runId };
  };

  return {
    advise,
    idle: () => queue,
  };
}
