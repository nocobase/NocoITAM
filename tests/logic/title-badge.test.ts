import { expect, it } from 'vitest';

import {
  titleBadgeText,
  titleWithBadge,
} from '../../client/lib/itam/title-badge.js';

// The inbox's number leads the browser tab's title (2026-10-25).
it('puts the inbox count in front of the title, never stacking', () => {
  expect(titleBadgeText(0)).toBeNull();
  expect(titleBadgeText(3)).toBe('3');
  expect(titleBadgeText(120)).toBe('99+');
  expect(titleWithBadge('NocoITAM', '3')).toBe('(3) NocoITAM');
  expect(titleWithBadge('(3) NocoITAM', '99+')).toBe('(99+) NocoITAM');
  expect(titleWithBadge('(99+) NocoITAM', null)).toBe('NocoITAM');
});
