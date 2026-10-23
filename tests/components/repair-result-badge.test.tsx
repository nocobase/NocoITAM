import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { RepairResultBadge } from '../../client/components/itam/status-badge.js';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

// A repair's result is toned (2026-10-23): light tints as the device
// statuses — 已修复 green, 已更换整机 blue, 已取消 grey.
it('tones a repair result by how it ended', () => {
  render(
    <>
      <RepairResultBadge result='repaired' />
      <RepairResultBadge result='inProgress' />
      <RepairResultBadge result='unrepairable' />
      <RepairResultBadge result='replaced' />
      <RepairResultBadge result='cancelled' />
    </>,
  );
  expect(screen.getByText('enums.repairResult.repaired').className).toContain(
    'bg-success',
  );
  expect(screen.getByText('enums.repairResult.replaced').className).toContain(
    'bg-info',
  );
  expect(screen.getByText('enums.repairResult.cancelled').className).toContain(
    'bg-muted',
  );
  expect(screen.getByText('enums.repairResult.inProgress').className).toContain(
    'bg-warning',
  );
  expect(
    screen.getByText('enums.repairResult.unrepairable').className,
  ).toContain('text-destructive');
});

// 改为报废 in violet, a tint no other ending has (2026-10-23).
it('tints a repair turned into a disposal violet', () => {
  render(<RepairResultBadge result='scrapped' />);
  const tag = screen.getByText('enums.repairResult.scrapped');
  expect(tag.className).toContain('bg-loan');
});
