import type { RenewalMaterial } from '../renewal-review.js';

/**
 * The eval set of the `renewal-review` skill (2026-10-17, plan "Work
 * agents", step 2): entitlements coming up for renewal as the review reads
 * them, and the recommendations a person who knows the method would accept.
 * What is scored is the judgement — renew as it is, renew with fewer seats,
 * let it lapse — not the wording or the arithmetic. Run them before
 * changing the skill, the work agent's instructions or its model
 * (NocoSolution guideline 1.3, 3.5): `POST
 * /api/itam/ai/evals/renewal-review`.
 *
 * Ids and numbers are only labels; nothing here is read from the database.
 */

export interface RenewalEvalCase {
  readonly id: string;
  readonly title: string;
  readonly material: RenewalMaterial;
  /** The recommendations that pass. */
  readonly expect: readonly ('renew' | 'reduce' | 'lapse')[];
}

/** `count` seats held by people, the first `left` of them by leavers. */
function seats(count: number, left = 0): RenewalMaterial['seats'] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `seat-${String(index + 1)}`,
    holderType: 'person',
    holderId: `person-${String(index + 1)}`,
    holderIdName: `员工 ${String(index + 1)}`,
    account: `user${String(index + 1)}@example.com`,
    assignedAt: '2025-11-01',
    holderLeft: index < left,
  }));
}

function material(
  entitlement: Record<string, unknown>,
  held: RenewalMaterial['seats'],
  joinersComing: number,
): RenewalMaterial {
  return {
    entitlement: {
      kind: 'subscription',
      licensingModel: 'perUser',
      billingModel: 'perSeat',
      billingCycle: 'year',
      currency: 'CNY',
      autoRenew: true,
      ...entitlement,
      assignedCount: held.length,
    },
    seats: held,
    leaversSeats: held
      .filter((seat) => seat.holderLeft)
      .map((seat) => String(seat.id)),
    joinersComing,
    idleSeatRatio: 0.3,
    today: '2026-10-17',
  };
}

export const RENEWAL_REVIEW_EVALS: readonly RenewalEvalCase[] = [
  {
    id: 'leavers-hold-a-third',
    title: 'Six of eighteen seats held by leavers, nobody joining',
    material: material(
      {
        name: 'Figma Organization',
        seatCount: 20,
        unitPrice: 1_200,
        annualCost: 24_000,
        expiryDate: '2026-11-10',
      },
      seats(18, 6),
      0,
    ),
    expect: ['reduce'],
  },
  {
    id: 'full-with-joiners',
    title: 'Every seat in use and three people joining',
    material: material(
      {
        name: 'JetBrains All Products',
        seatCount: 10,
        unitPrice: 2_100,
        annualCost: 21_000,
        expiryDate: '2026-11-20',
      },
      seats(10),
      3,
    ),
    expect: ['renew'],
  },
  {
    id: 'two-seats-both-left',
    title: 'Twenty-five seats, two assigned, both to leavers',
    material: material(
      {
        name: 'Sketch Business',
        seatCount: 25,
        unitPrice: 900,
        annualCost: 22_500,
        expiryDate: '2026-11-05',
      },
      seats(2, 2),
      0,
    ),
    expect: ['lapse'],
  },
  {
    id: 'near-full-one-leaver-one-joiner',
    title: 'One leaver and one joiner on a nearly full subscription',
    material: material(
      {
        name: 'Microsoft 365 E3',
        seatCount: 10,
        unitPrice: 2_400,
        annualCost: 24_000,
        expiryDate: '2026-11-30',
      },
      seats(9, 1),
      1,
    ),
    expect: ['renew'],
  },
  {
    id: 'perpetual-maintenance-in-use',
    title: "A perpetual licence's maintenance, every seat in use",
    material: material(
      {
        kind: 'perpetual',
        name: 'AutoCAD 2024',
        seatCount: 15,
        billingModel: null,
        billingCycle: null,
        autoRenew: false,
        unitPrice: null,
        maintenanceCost: 18_000,
        maintenanceExpiryDate: '2026-11-15',
      },
      seats(15),
      2,
    ),
    expect: ['renew'],
  },
];
