import {
  defineLifecycle,
  type GuardVerdict,
  type Lifecycle,
  type LifecycleRecord,
  type TransitionContext,
} from '@nocobase/lifecycle';

/**
 * A repair's lifecycle (2026-10-19, after the disposals' and purchase
 * orders', docs/adr/0001-record-lifecycles.md). Its state is the repair's
 * result: in progress from the moment it is filed, then repaired,
 * unrepairable or replaced once it is completed. A finished repair's result
 * may be corrected among the three, never back to in progress. The runtime
 * writes the result, its version and the log entry in the repair service's
 * own transaction; the service moves the device — to repair, back, or to
 * pending disposal — in that same transaction. A repair tells nobody, so
 * there are no effects.
 *
 * The names below are stored with every log entry: never rename the
 * lifecycle, a state or a transition casually.
 */

export const REPAIR_LIFECYCLE = 'repairs';

export type RepairState =
  'inProgress' | 'repaired' | 'unrepairable' | 'replaced';

const FINISHED: readonly RepairState[] = [
  'repaired',
  'unrepairable',
  'replaced',
];

export interface RepairRecord extends LifecycleRecord {
  readonly result: RepairState;
  readonly ownerId?: unknown;
}

export interface RepairTypes {
  record: RepairRecord;
  state: RepairState;
}

type Context = TransitionContext<RepairTypes>;

const text = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'bigint'
      ? String(value)
      : '';

/** The result a move asks for, as the service passes it. */
const resultOf = ({ input }: Context): RepairState => {
  const result = text(input.result) as RepairState;
  return FINISHED.includes(result) ? result : 'repaired';
};

const validateResult = (input: Record<string, unknown>) =>
  FINISHED.includes(text(input.result) as RepairState)
    ? null
    : [{ field: 'result', message: 'Invalid repair result' }];

/**
 * Finishing a repair is its 负责人's, or a supervisor's (2026-10-05): the
 * people who hold `delete` on repairs may also close one somebody else
 * follows. Whether the caller supervises is the grant's answer, which the
 * route asks and the service passes along.
 */
const ownerOrSupervisor = ({ record, actor, input }: Context): GuardVerdict =>
  input.supervises === true ||
  actor.id === text(record.ownerId) || {
    code: 'NOT_OWNER',
    message: 'Only the owner or a supervisor can complete this repair',
  };

/** Every transition is a write to the repair. */
const touched = ({ now }: { readonly now: Date }) => ({ updatedAt: now });

export const repairLifecycle: Lifecycle<RepairTypes> =
  defineLifecycle<RepairTypes>({
    name: REPAIR_LIFECYCLE,
    stateField: 'result',
    initial: 'inProgress',
    states: ['inProgress', 'repaired', 'unrepairable', 'replaced'],
    transitions: {
      complete: {
        title: 'Complete',
        from: 'inProgress',
        to: [...FINISHED],
        route: resultOf,
        guard: ownerOrSupervisor,
        validate: validateResult,
        accept: ['actualReturnAt', 'cost', 'currency', 'notes'],
        set: touched,
      },
      // A finished repair's result corrected; what it changed about the
      // device stays as it was.
      correct: {
        title: 'Correct the result',
        from: [...FINISHED],
        to: [...FINISHED],
        route: resultOf,
        validate: validateResult,
        set: touched,
      },
    },
  });
