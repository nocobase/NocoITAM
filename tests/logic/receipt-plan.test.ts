// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  checkBatch,
  normalizeCode,
  planReceipt,
  receiptStats,
  type PlanLine,
} from '../../server/providers/itam/receipt-plan.js';

const laptops: PlanLine = {
  id: 'line-laptop',
  itemType: 'device',
  modelCode: 'MRX63CH/A',
  outstanding: 3,
  requiresSerial: true,
};
const monitors: PlanLine = {
  id: 'line-monitor',
  itemType: 'device',
  modelCode: 'U2723QE',
  outstanding: 2,
  requiresSerial: false,
};
const mice: PlanLine = {
  id: 'line-mouse',
  itemType: 'accessory',
  modelCode: '910-005712',
  outstanding: 10,
  requiresSerial: false,
};
const seats: PlanLine = {
  id: 'line-figma',
  itemType: 'subscription',
  modelCode: null,
  outstanding: 5,
  requiresSerial: false,
};
const LINES = [laptops, monitors, mice, seats];

const codes = (issues: readonly { code: string }[]) =>
  issues.map((entry) => entry.code).sort();

describe('receipt plan', () => {
  it('compares part codes without the punctuation vendors vary', () => {
    expect(normalizeCode('mrx63ch-a')).toBe(normalizeCode('MRX63CH/A'));
    expect(normalizeCode(' 910 005712 ')).toBe('910005712');
    expect(normalizeCode(null)).toBe('');
  });

  it('matches by part code before the assistant, and says when they differ', () => {
    const plan = planReceipt(
      {
        rows: [
          {
            // The assistant guessed the monitors; the code says laptops.
            lineId: 'line-monitor',
            description: 'MacBook Pro 14 M3 18G/512',
            partCode: 'mrx63ch-a',
            quantity: 2,
            serialNos: ['C02X1', ' C02X2 '],
            source: 'Sheet1 row 4',
          },
        ],
      },
      LINES,
    );
    expect(plan.lines).toEqual([
      {
        lineId: 'line-laptop',
        quantity: 2,
        units: [
          { serialNo: 'C02X1', source: 'Sheet1 row 4' },
          { serialNo: 'C02X2', source: 'Sheet1 row 4' },
        ],
        matchedBy: ['partCode'],
        sources: ['Sheet1 row 4'],
      },
    ]);
    expect(codes(plan.issues)).toEqual(['matchConflict', 'shortDelivery']);
  });

  it('takes the assistant’s match when no code decides, and leaves the rest out', () => {
    const plan = planReceipt(
      {
        deliveryNo: ' DN-001 ',
        rows: [
          {
            lineId: 'line-mouse',
            description: 'Logitech MX Master 3S',
            quantity: 10,
          },
          { lineId: null, description: 'Shipping', quantity: 1 },
          { lineId: 'line-figma', description: 'Figma seats', quantity: 5 },
          { lineId: 'nonsense', description: 'Dock', quantity: 1 },
        ],
      },
      LINES,
    );
    expect(plan.header.deliveryNo).toBe('DN-001');
    expect(plan.lines.map((line) => [line.lineId, line.quantity])).toEqual([
      ['line-mouse', 10],
    ]);
    expect(plan.lines[0]?.matchedBy).toEqual(['assistant']);
    expect(codes(plan.issues)).toEqual([
      'notReceivable',
      'unmatched',
      'unmatched',
    ]);
  });

  it('keeps one unit per device even where the document lists fewer serials', () => {
    const plan = planReceipt(
      {
        rows: [
          {
            lineId: 'line-monitor',
            description: 'Dell U2723QE',
            quantity: 2,
            serialNos: ['CN-1'],
          },
        ],
      },
      LINES,
    );
    expect(plan.lines[0]?.units).toEqual([
      { serialNo: 'CN-1' },
      { serialNo: '' },
    ]);
    expect(codes(plan.issues)).toEqual(['serialCount']);
  });

  it('refuses more than is outstanding, a serial twice, one on the books and a missing required serial', () => {
    const issues = checkBatch(
      [
        {
          lineId: 'line-laptop',
          quantity: 4,
          serialNos: ['A', 'B', 'A', ''],
        },
        { lineId: 'line-monitor', quantity: 1, serialNos: ['OLD'] },
      ],
      LINES,
      new Set(['OLD']),
    );
    expect(issues.every((entry) => entry.blocking)).toBe(true);
    expect(codes(issues)).toEqual([
      'duplicateInBatch',
      'duplicateInRegister',
      'overReceipt',
      'serialRequired',
    ]);
  });

  it('counts what the receiver kept of the plan, field by field', () => {
    const plan = planReceipt(
      {
        rows: [
          {
            lineId: 'line-laptop',
            description: 'MacBook',
            quantity: 3,
            serialNos: ['A', 'B', 'C'],
          },
          { lineId: 'line-mouse', description: 'Mouse', quantity: 10 },
        ],
      },
      LINES,
    );
    const stats = receiptStats(plan, [
      // B corrected to B1, C dropped, a monitor added by hand.
      { lineId: 'line-laptop', quantity: 2, serialNos: ['A', 'B1'] },
      { lineId: 'line-mouse', quantity: 10 },
      { lineId: 'line-monitor', quantity: 1, serialNos: ['M1'] },
    ]);
    expect(stats.quantity).toEqual({
      accepted: 1,
      changed: 1,
      removed: 0,
      added: 1,
    });
    expect(stats.serialNo).toEqual({
      accepted: 1,
      changed: 1,
      removed: 1,
      added: 1,
    });
  });
});
