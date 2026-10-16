import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import type { ServiceResolver } from '@nocobase/service-provider';
import { z, type ZodType } from 'zod';

import { assistantId } from '../itam-agents/assistant.js';
import { SKILLS_DIR } from '../itam-agents/library.js';
import { WORK_AGENTS, workAgentIds } from '../itam-agents/work-agents.js';
import type { AgentName } from './agent-runs.js';
import { BusinessRuleError } from './errors.js';

/**
 * ITAM's own model calls (template 1.0.0-beta.64, after NocoCRM's): reading
 * a delivery document, AI 整理 on a purchase order, a model's or a product's
 * details, and Asset Steward choosing a joiner's equipment ask the Agents plugin's
 * model gateway, which keeps the keys and records the use. Each is a
 * session of turns, each one call; the answer is JSON in the reply, checked
 * against the shape the caller gives — the gateway's `generate` has no
 * structured output of its own — and asked once more when it is not.
 *
 * The model is Asset Steward's first, so changing Asset Steward's model on AI → 智能体 changes
 * this work too; without one, the system's default chat model. None means
 * the assistant is unavailable, and the pages keep their plain forms.
 */

export const AI_SOURCE = 'NocoITAM';

type ModelRef = { modelService: string; model: string };

/** The model the work answers with, or null when there is none to ask. */
export async function itamModel(
  container: ServiceResolver,
): Promise<ModelRef | null> {
  if (!container.has(agentsToken)) return null;
  const agents = container.resolve(agentsToken);
  try {
    const id = container.has(databaseManagerToken)
      ? await assistantId(container.resolve(databaseManagerToken))
      : null;
    const agentIds = [id, (await agents.chat.settings()).defaultAgentId];
    for (const agentId of agentIds) {
      if (!agentId) continue;
      const agent = await agents.agents.get(agentId).catch(() => null);
      const entry = agent && !agent.archivedAt ? agent.modelEntries[0] : null;
      if (entry && 'modelService' in entry)
        return { modelService: entry.modelService, model: entry.model };
    }
  } catch {
    // Unreadable: the system default below.
  }
  const catalog = await agents.online.gateway.catalog('chat').catch(() => null);
  return catalog?.defaultModel ?? null;
}

/**
 * A work agent's model and instructions (2026-10-16, work-agents.ts): its
 * first model when it lists one, else Asset Steward's (`itamModel`); null when there
 * is no model to ask. One an administrator archived or deleted leaves its
 * work to Asset Steward's model and no instructions of its own.
 */
export async function workRun(
  container: ServiceResolver,
  work: AgentName,
): Promise<{ model: ModelRef; instructions: string } | null> {
  if (!container.has(agentsToken)) return null;
  let instructions = '';
  try {
    const id = container.has(databaseManagerToken)
      ? (await workAgentIds(container.resolve(databaseManagerToken)))[work]
      : undefined;
    const agent = id
      ? await container
          .resolve(agentsToken)
          .agents.get(id)
          .catch(() => null)
      : null;
    if (agent && !agent.archivedAt) {
      instructions = (agent.instructions ?? '').trim();
      const entry = agent.modelEntries[0];
      if (entry && 'modelService' in entry)
        return {
          model: { modelService: entry.modelService, model: entry.model },
          instructions,
        };
    }
  } catch {
    // Unreadable: Asset Steward's model below.
  }
  const model = await itamModel(container).catch(() => null);
  return model ? { model, instructions } : null;
}

/** Whether the work can run: there is a model to ask. */
export async function aiAvailable(
  container: ServiceResolver,
): Promise<boolean> {
  return (await itamModel(container).catch(() => null)) !== null;
}

export interface ModelSession {
  /** Asks the next turn and returns the reply's text. */
  ask(content: string, signal?: AbortSignal): Promise<string>;
  /**
   * Asks for one JSON object in the given shape, spelled out after the
   * content; once more when the reply does not hold it. Null when neither
   * did.
   */
  askJson<T>(
    content: string,
    shape: ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T | null>;
}

/**
 * A run of turns with the model, its system prompt today's date in the
 * deployment's time zone and the task's own instructions; null when there is
 * no model to ask.
 */
export async function openSession(
  container: ServiceResolver,
  {
    timeZone,
    system,
    work,
  }: {
    timeZone: string;
    system: string;
    /**
     * A work agent's run (2026-10-16): its model and instructions, its use
     * recorded under its name on 用量.
     */
    work?: AgentName;
  },
): Promise<(ModelSession & { readonly model: ModelRef }) | null> {
  const run = work
    ? await workRun(container, work).catch(() => null)
    : await itamModel(container)
        .then((model) => (model ? { model, instructions: '' } : null))
        .catch(() => null);
  if (!run) return null;
  const { model } = run;
  const now = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  const prompt = [
    `The current time is ${now} (${timeZone}).`,
    run.instructions,
    system,
  ]
    .filter(Boolean)
    .join('\n\n');
  const gateway = container.resolve(agentsToken).online.gateway;
  const turns: { role: 'user' | 'assistant'; text: string }[] = [];
  const ask = async (content: string, signal?: AbortSignal) => {
    turns.push({ role: 'user', text: content });
    // One prompt: the earlier turns as a transcript, then the question.
    const text =
      turns.length === 1
        ? content
        : `${turns
            .slice(0, -1)
            .map(
              (turn) =>
                `${turn.role === 'user' ? 'User' : 'Assistant'}:\n${turn.text}`,
            )
            .join('\n\n')}\n\nUser:\n${content}`;
    const reply = await gateway.generate({
      model,
      system: prompt,
      prompt: text,
      maxOutputTokens: 16_000,
      source: work ? WORK_AGENTS[work].name : AI_SOURCE,
      ...(signal ? { signal } : {}),
    });
    turns.push({ role: 'assistant', text: reply.text });
    return reply.text;
  };
  return {
    model,
    ask,
    async askJson<T>(
      content: string,
      shape: ZodType<T>,
      signal?: AbortSignal,
    ): Promise<T | null> {
      const read = (text: string) => shape.safeParse(jsonIn(text));
      const first = read(
        await ask(
          `${content}\n\nReturn only one JSON object, with no other text, matching this JSON Schema:\n${shapeOf(shape)}`,
          signal,
        ),
      );
      if (first.success) return first.data;
      const again = read(
        await ask(
          `The previous reply was not in the required format. Keeping the same answer, return only one JSON object and nothing else, matching this JSON Schema:\n${shapeOf(shape)}`,
          signal,
        ),
      );
      return again.success ? again.data : null;
    },
  };
}

/** A zod shape as the JSON Schema a prompt shows the model. */
export function shapeOf(shape: ZodType): string {
  try {
    return JSON.stringify(z.toJSONSchema(shape, { unrepresentable: 'any' }));
  } catch {
    return '{}';
  }
}

/**
 * A method skill's text without its frontmatter: the Agents plugin's
 * library's current version, where people edit it (library.ts puts it
 * there), else its SKILL.md as shipped. Empty when neither has it.
 */
export async function readSkill(
  container: ServiceResolver,
  name: string,
): Promise<string> {
  let text: string | null = null;
  if (container.has(agentsToken))
    try {
      const skills = container.resolve(agentsToken).skills;
      const skill = (await skills.list()).find((s) => s.slug === name);
      if (skill) text = (await skills.get(skill.id)).content;
    } catch {
      // The library cannot be read: the shipped file below.
    }
  text ??= await readFile(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8').catch(
    () => '',
  );
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '').trim();
}

/** The JSON a reply wrote, alone, in a ```json fence or among other text. */
export function jsonIn(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/u.exec(text)?.[1];
  const candidates = [
    fenced,
    text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1),
  ];
  for (const candidate of candidates) {
    if (!candidate?.trim()) continue;
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Not JSON; try the next reading.
    }
  }
  return undefined;
}

/**
 * A model call that failed, as ITAM's error: no usable model (no service, a
 * refused key) is the assistant being unavailable, anything else the reading
 * failing. The gateway's `ModelError` is known by its name and code; the
 * plugin does not export it.
 */
export function modelFailure(error: unknown): BusinessRuleError {
  const raw =
    error instanceof Error && error.name === 'ModelError'
      ? (error as Error & { code?: unknown }).code
      : undefined;
  const code = typeof raw === 'string' ? raw : '';
  const detail = error instanceof Error ? error.message : String(error);
  return code === 'config' || code === 'auth'
    ? new BusinessRuleError(detail, 'AI_UNAVAILABLE')
    : new BusinessRuleError(detail, 'AI_FAILED');
}
