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

  // A code is evidence, not proof (2026-10-30): a battery printed with a
  // laptop's code is left for the receiver rather than matched.
  it('leaves a row whose name plainly contradicts its code unmatched', () => {
    const plan = planReceipt(
      {
        rows: [
          {
            lineId: null,
            description: 'Dell Latitude 5440 battery',
            partCode: 'MRX63CH/A',
            quantity: 2,
            serialNos: ['S1', 'S2'],
            nameDiffers: true,
          },
          {
            lineId: null,
            description: 'MacBook Pro 14 space black 16GB',
            partCode: 'mrx63ch-a',
            quantity: 1,
            serialNos: ['S3'],
          },
        ],
      },
      LINES,
    );
    expect(plan.lines).toEqual([
      expect.objectContaining({ lineId: 'line-laptop', quantity: 1 }),
    ]);
    expect(plan.issues).toContainEqual(
      expect.objectContaining({
        code: 'codeNameConflict',
        lineId: 'line-laptop',
        blocking: false,
      }),
    );
  });

  // Read from the document's content, never its file name (2026-10-30).
  it('warns when the document prints another order number', () => {
    const plan = (orderNo: string) =>
      planReceipt({ orderNo, rows: [] }, LINES, '', 'PO-000067');
    expect(codes(plan('PO-000066').issues)).toEqual(['orderMismatch']);
    expect(plan('PO-000066').issues[0]).toMatchObject({
      orderNo: 'PO-000066',
    });
    expect(plan('po 000067').issues).toEqual([]);
    expect(
      planReceipt({ orderNo: null, rows: [] }, LINES, '', 'PO-000067').issues,
    ).toEqual([]);
  });

  it('dates a warranty the document states, for devices', () => {
    const plan = planReceipt(
      {
        deliveryDate: '2026-10-15',
        rows: [
          {
            lineId: 'line-laptop',
            description: 'MacBook Pro 14',
            quantity: 1,
            serialNos: ['C02X1'],
            source: 'page 1 line 1',
            warrantyMonths: 36,
          },
          {
            lineId: 'line-monitor',
            description: 'U2723QE',
            quantity: 1,
            serialNos: ['CN01'],
            warrantyEndDate: '2029-12-31',
          },
          // Stock keeps no warranty.
          {
            lineId: 'line-mouse',
            description: 'MX Master',
            quantity: 2,
            warrantyMonths: 12,
          },
        ],
      },
      LINES,
      '2026-10-20',
    );
    const by = (id: string) => plan.lines.find((line) => line.lineId === id);
    // Counted from the delivery date, not from today.
    expect(by('line-laptop')).toMatchObject({
      warrantyEndDate: '2029-10-15',
      warrantySource: 'page 1 line 1',
    });
    expect(by('line-monitor')?.warrantyEndDate).toBe('2029-12-31');
    expect(by('line-mouse')?.warrantyEndDate).toBeUndefined();
    // Without a delivery date, from today; with no warranty stated, none.
    const undated = planReceipt(
      {
        rows: [
          {
            lineId: 'line-laptop',
            description: 'MacBook Pro 14',
            quantity: 1,
            serialNos: ['C02X1'],
            warrantyMonths: 12,
          },
          {
            lineId: 'line-monitor',
            description: 'U2723QE',
            quantity: 1,
            serialNos: ['CN01'],
          },
        ],
      },
      LINES,
      '2026-10-20',
    );
    expect(undated.lines.map((line) => line.warrantyEndDate)).toEqual([
      '2027-10-20',
      undefined,
    ]);
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

  it('takes the assistant’s match when no code decides, and lists what it could not match', () => {
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
    // Seats are planned like any quantity.
    expect(plan.lines.map((line) => [line.lineId, line.quantity])).toEqual([
      ['line-mouse', 10],
      ['line-figma', 5],
    ]);
    expect(plan.lines[0]?.matchedBy).toEqual(['assistant']);
    expect(codes(plan.issues)).toEqual(['unmatched', 'unmatched']);
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
