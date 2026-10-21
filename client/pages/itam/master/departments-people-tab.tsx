import type { ReactElement } from 'react';

import { PeopleUnderTab } from './people-under-tab.js';

export default function Tab(): ReactElement | null {
  return <PeopleUnderTab collection='departments' field='departmentId' />;
}
