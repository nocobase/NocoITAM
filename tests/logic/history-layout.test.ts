import { describe, expect, it } from 'vitest';

import {
  dayOf,
  groupEdits,
  layoutTimeline,
  type LayoutItem,
} from '../../client/lib/itam/history-layout.js';

const at = (day: number, hour: number, minute = 0) =>
  `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000`;
const edit = (id: string, createdAt: string, actorId = 'mia'): LayoutItem => ({
  id,
  createdAt,
  actorId,
  event: null,
});
const event = (id: string, createdAt: string, type = 'assign'): LayoutItem => ({
  id,
  createdAt,
  actorId: 'mia',
  event: { type },
});

describe('history layout', () => {
  it('folds one person’s edits of one sitting into one line', () => {
    const units = groupEdits([
      edit('a', at(16, 14, 9)),
      edit('b', at(16, 14, 2)),
      // Another person, then an hour later: lines of their own.
      edit('c', at(16, 14, 1), 'sam'),
      edit('d', at(16, 13, 0), 'sam'),
      event('e', at(16, 12, 59)),
    ]);
    expect(units.map((unit) => [unit.kind, unit.id])).toEqual([
      ['edits', 'edits:a'],
      ['item', 'c'],
      ['item', 'd'],
      ['item', 'e'],
    ]);
  });

  it('heads each day and folds a long run of changes between comments', () => {
    const items = [
      event('c1', at(16, 15), 'comment'),
      ...['1', '2', '3', '4', '5', '6', '7'].map((id, index) =>
        event(id, at(index < 3 ? 16 : 15, 12 - index)),
      ),
      event('c2', at(14, 9), 'comment'),
    ];
    const entries = layoutTimeline(groupEdits(items), new Set());
    expect(
      entries.map((entry) =>
        entry.kind === 'day'
          ? entry.day
          : entry.kind === 'fold'
            ? `fold ${String(entry.units.length)}`
            : entry.unit.id,
      ),
    ).toEqual([
      '2026-10-16',
      'c1',
      '1',
      '2',
      '3',
      'fold 4',
      '2026-10-14',
      'c2',
    ]);
    // Opened, the fold shows every line under its own day.
    const fold = entries.find((entry) => entry.kind === 'fold');
    const open = layoutTimeline(
      groupEdits(items),
      new Set([fold?.kind === 'fold' ? fold.id : '']),
    );
    expect(open.filter((entry) => entry.kind === 'day')).toHaveLength(3);
    expect(open.some((entry) => entry.kind === 'fold')).toBe(false);
  });

  it('reads a day in the local calendar', () => {
    expect(dayOf('2026-10-16T23:30:00.000')).toBe('2026-10-16');
  });
});
