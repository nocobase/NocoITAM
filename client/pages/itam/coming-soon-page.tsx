import type { ReactElement } from 'react';
import { useLocation } from 'react-router';

import { ComingSoon } from '@/components/itam/coming-soon';

/** Which phase delivers each placeholder route, keyed by first path segment. */
const PHASES: Readonly<Record<string, string>> = {
  devices: 'P1',
  accessories: 'P2',
  consumables: 'P2',
  components: 'P2',
  entitlements: 'P2',
  procurement: 'P3',
  audits: 'P4',
  disposals: 'P4',
  reports: 'P5',
  'my-assets': 'P1',
};

export default function ComingSoonPage(): ReactElement {
  const segment = useLocation().pathname.split('/').filter(Boolean)[0] ?? '';
  const key = segment.replace(/-([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
  return (
    <ComingSoon
      titleKey={`navigation.${key}`}
      phase={PHASES[segment] ?? 'later'}
    />
  );
}
