/**
 * The eval set of the `offboarding` skill as 离职回收 asks it (2026-10-17,
 * plan "Work agents", step 2): a leaver's items as the review reads them,
 * and where a person who knows the method would send each one — a device
 * back to stock, to repair, to disposal or straight to a joiner; stock taken
 * back; a seat reclaimed; nothing for an item at the repair shop. The
 * wording is not scored. Run them before changing the skill, the work
 * agent's instructions or its model (NocoSolution guideline 1.3, 3.5):
 * `POST /api/itam/ai/evals/offboarding`.
 *
 * Ids and numbers are only labels; nothing here is read from the database.
 */

/** One acceptable change for an item. */
export interface OffboardingChange {
  readonly action: 'return' | 'transfer' | 'takeBack' | 'reclaim';
  readonly nextStatus?: 'inStock' | 'inRepair' | 'pendingDisposal';
  readonly targetPersonId?: string;
}

export interface OffboardingEvalCase {
  readonly id: string;
  readonly title: string;
  readonly material: {
    readonly leaver: Record<string, unknown>;
    readonly items: readonly Record<string, unknown>[];
    readonly joiners: readonly Record<string, unknown>[];
    readonly today: string;
  };
  /** Per item id, the changes that pass; empty when it must get none. */
  readonly expect: Readonly<Record<string, readonly OffboardingChange[]>>;
}

const leaver = {
  name: '赵磊',
  departmentIdName: '研发部',
  position: '前端工程师',
  employmentStatus: 'left',
  leaveDate: '2026-10-15',
};

function laptop(
  id: string,
  device: Record<string, unknown>,
  repairs = 0,
): Record<string, unknown> {
  return {
    id,
    kind: 'device',
    label: `${String(device.deviceNo)} / ${String(device.name)}`,
    handling: 'return',
    device: { status: 'inUse', ...device },
    repairs,
  };
}

export const OFFBOARDING_EVALS: readonly OffboardingEvalCase[] = [
  {
    id: 'sound-laptop-to-stock',
    title: 'A two-year-old laptop in good order, nobody joining',
    material: {
      leaver,
      items: [
        laptop('d1', {
          deviceNo: 'DE-000031',
          name: 'MacBook Pro 14 M2',
          purchaseDate: '2024-09-01',
          warrantyExpiryDate: '2027-09-01',
          currentBookValue: 8_600,
        }),
      ],
      joiners: [],
      today: '2026-10-17',
    },
    expect: { d1: [{ action: 'return', nextStatus: 'inStock' }] },
  },
  {
    id: 'faulty-laptop-to-repair',
    title: 'A laptop whose record says the screen flickers',
    material: {
      leaver,
      items: [
        laptop(
          'd1',
          {
            deviceNo: 'DE-000044',
            name: 'ThinkPad X1 Carbon',
            purchaseDate: '2025-03-10',
            warrantyExpiryDate: '2028-03-10',
            currentBookValue: 7_900,
            notes: '屏幕闪烁，交还前反馈过两次',
          },
          1,
        ),
      ],
      joiners: [],
      today: '2026-10-17',
    },
    expect: { d1: [{ action: 'return', nextStatus: 'inRepair' }] },
  },
  {
    id: 'old-laptop-to-disposal',
    title: 'An eight-year-old laptop long out of warranty, worth nothing',
    material: {
      leaver,
      items: [
        laptop(
          'd1',
          {
            deviceNo: 'DE-000003',
            name: 'Latitude 5480',
            purchaseDate: '2018-05-20',
            warrantyExpiryDate: '2021-05-20',
            currentBookValue: 0,
          },
          3,
        ),
      ],
      joiners: [],
      today: '2026-10-17',
    },
    expect: { d1: [{ action: 'return', nextStatus: 'pendingDisposal' }] },
  },
  {
    id: 'laptop-to-joiner',
    title: 'A frontend engineer joins next week, needing the same laptop',
    material: {
      leaver,
      items: [
        laptop('d1', {
          deviceNo: 'DE-000052',
          name: 'MacBook Pro 14 M3',
          purchaseDate: '2025-08-01',
          warrantyExpiryDate: '2028-08-01',
          currentBookValue: 11_200,
        }),
      ],
      joiners: [
        {
          id: 'p-join',
          name: '孙浩',
          department: '研发部',
          position: '前端工程师',
          hireDate: '2026-10-22',
        },
      ],
      today: '2026-10-17',
    },
    expect: {
      d1: [
        { action: 'transfer', targetPersonId: 'p-join' },
        // Back to stock first is also sound; the joiner takes it from there.
        { action: 'return', nextStatus: 'inStock' },
      ],
    },
  },
  {
    id: 'stock-seat-and-repair',
    title: 'A dock, a design seat and a laptop at the repair shop',
    material: {
      leaver,
      items: [
        {
          id: 'h1',
          kind: 'stock',
          label: 'CalDigit TS4 扩展坞',
          handling: 'takeBack',
          quantity: 1,
        },
        {
          id: 's1',
          kind: 'seat',
          label: 'Figma Organization',
          handling: 'reclaim',
          account: 'zhao.lei@example.com',
        },
        {
          id: 'd9',
          kind: 'device',
          label: 'DE-000040 / MacBook Air 13',
          handling: 'wait',
          waitingOnRepair: 'RP-000017',
          device: { status: 'inRepair' },
        },
      ],
      joiners: [],
      today: '2026-10-17',
    },
    expect: {
      h1: [{ action: 'takeBack' }],
      s1: [{ action: 'reclaim' }],
      d9: [],
    },
  },
];
