import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { RepairResultBadge } from '../../client/components/itam/status-badge.js';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

// A repair's result is toned (2026-10-23): 已修复 solid like 已完成, not grey.
it('tones a repair result by how it ended', () => {
  render(
    <>
      <RepairResultBadge result='repaired' />
      <RepairResultBadge result='inProgress' />
      <RepairResultBadge result='unrepairable' />
    </>,
  );
  expect(screen.getByText('enums.repairResult.repaired').className).toContain(
    'bg-primary',
  );
  expect(screen.getByText('enums.repairResult.inProgress').className).toContain(
    'bg-warning',
  );
  expect(
    screen.getByText('enums.repairResult.unrepairable').className,
  ).toContain('text-destructive');
});
