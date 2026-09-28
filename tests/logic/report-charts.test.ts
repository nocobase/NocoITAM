import { describe, expect, it } from 'vitest';

import {
  periodRange,
  REPORT_GROUPS,
  reportChartOf,
} from '../../client/lib/itam/report-charts.js';
import { REPORT_NAMES } from '../../client/lib/itam/workbench.js';

describe('report periods and charts', () => {
  it('turns a preset into this month, quarter or year so far, in local dates', () => {
    const today = new Date(2026, 7, 14); // 14 August 2026
    expect(periodRange('month', today)).toEqual({
      from: '2026-08-01',
      to: '2026-08-14',
    });
    expect(periodRange('quarter', today)).toEqual({
      from: '2026-07-01',
      to: '2026-08-14',
    });
    expect(periodRange('year', today)).toEqual({
      from: '2026-01-01',
      to: '2026-08-14',
    });
  });

  it('lists every report in exactly one group', () => {
    const grouped = REPORT_GROUPS.flatMap((group) => group.reports);
    expect([...grouped].sort()).toEqual([...REPORT_NAMES].sort());
  });

  it('draws distributions and months, and leaves record lists as tables', () => {
    expect(reportChartOf('overview', 'byStatus')?.kind).toBe('bars');
    expect(reportChartOf('costs', 'spendByMonth')?.kind).toBe('columns');
    expect(reportChartOf('ledger', 'devices')).toBeUndefined();
    expect(reportChartOf('expiry', 'warranty')).toBeUndefined();
  });
});
