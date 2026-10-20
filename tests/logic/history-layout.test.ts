import { describe, expect, it } from 'vitest';

import {
  bucketOf,
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

  it('keeps a record’s creation a line of its own, never folded with the edits after it', () => {
    const units = groupEdits([
      edit('b', at(16, 14, 5)),
      edit('a', at(16, 14, 4)),
      { ...edit('created', at(16, 14, 0)), changes: [{ action: 'create' }] },
    ]);
    expect(units.map((unit) => [unit.kind, unit.id])).toEqual([
      ['edits', 'edits:b'],
      ['item', 'created'],
    ]);
  });

  it('heads each day and folds a long run of changes between comments', () => {
    const items = [
      event('c1', at(16, 15), 'comment'),
      ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'].map(
        (id, index) => event(id, at(index < 5 ? 16 : 15, 20 - index)),
      ),
      event('c2', at(14, 9), 'comment'),
    ];
    const now = new Date(2026, 9, 16, 18);
    const entries = layoutTimeline(groupEdits(items), new Set(), now);
    expect(
      entries.map((entry) =>
        entry.kind === 'day'
          ? entry.bucket
          : entry.kind === 'fold'
            ? `fold ${String(entry.units.length)}`
            : entry.unit.id,
      ),
    ).toEqual(['today', 'c1', '1', '2', '3', '4', '5', 'fold 6', 'week', 'c2']);
    // Opened, the fold shows every line under its own day.
    const fold = entries.find((entry) => entry.kind === 'fold');
    const open = layoutTimeline(
      groupEdits(items),
      new Set([fold?.kind === 'fold' ? fold.id : '']),
      now,
    );
    expect(open.filter((entry) => entry.kind === 'day')).toHaveLength(3);
    expect(open.some((entry) => entry.kind === 'fold')).toBe(false);
  });

  it('folds nothing on a record without comments', () => {
    const items = Array.from({ length: 12 }, (_, index) =>
      event(String(index), at(16, 20 - index)),
    );
    const entries = layoutTimeline(
      groupEdits(items),
      new Set(),
      new Date(2026, 9, 16, 18),
    );
    expect(entries.some((entry) => entry.kind === 'fold')).toBe(false);
    expect(entries.filter((entry) => entry.kind === 'unit')).toHaveLength(12);
  });

  it('heads recent lines by day and older ones by month or year', () => {
    const now = new Date(2026, 9, 16, 18);
    expect(bucketOf(at(16, 9), now)).toBe('today');
    expect(bucketOf(at(15, 23), now)).toBe('yesterday');
    expect(bucketOf(at(11, 9), now)).toBe('week');
    expect(bucketOf(at(2, 9), now)).toBe('month');
    expect(bucketOf('2026-07-08T10:00:00.000', now)).toBe('year');
    expect(bucketOf('2025-09-01T10:00:00.000', now)).toBe('yr-2025');
  });

  it('reads a day in the local calendar', () => {
    expect(dayOf('2026-10-16T23:30:00.000')).toBe('2026-10-16');
  });
});
