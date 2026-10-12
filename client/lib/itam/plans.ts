/**
 * The plans the assistant proposes (`server/providers/itam/plans.ts`), as
 * the chat shows them: a card among the conversation's messages, and the
 * wording of the news a decision sends back (template 1.0.0-beta.64).
 */
export const PLANS_PATH = 'assistant/plans';

export interface PlanStep {
  readonly id: string;
  readonly position: number;
  readonly op: string;
  readonly check: {
    readonly title: string;
    readonly fields: readonly {
      readonly field: string;
      readonly value: unknown;
      readonly name?: string;
    }[];
  } | null;
  readonly status: 'pending' | 'done' | 'failed' | 'removed';
  readonly result: Record<string, unknown> | null;
}

export interface Plan {
  readonly id: string;
  readonly title: string;
  readonly summary: string | null;
  readonly status:
    'pending' | 'executing' | 'executed' | 'failed' | 'voided' | 'expired';
  readonly revision: number;
  readonly failure: {
    readonly position: number;
    readonly code: string;
    readonly message: string;
  } | null;
  readonly createdAt: string;
  readonly decidedAt: string | null;
  readonly steps: readonly PlanStep[];
}
