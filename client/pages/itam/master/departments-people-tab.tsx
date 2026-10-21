import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { TabSection } from '@/components/itam/tab-section';
import { masterDataPath, useRelatedCounts } from '@/lib/itam/api';
import { masterTarget } from '@/lib/itam/related-targets';
import { useSubtree } from '@/lib/itam/tree';

import { RelatedListTab } from './related-list-tab.js';

const CURRENT = ['active', 'pending'];

/**
 * A department's people (2026-10-21), its sub-departments' included, with
 * each one's department when there are several: those on the books first —
 * 在职 before 待入职, each by employee number, as the tab counts them —
 * and those who left in a section of their own below.
 */
export default function Tab(): ReactElement | null {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const ids = useSubtree('departments', id);
  const [left] = useRelatedCounts(
    ids
      ? [
          {
            path: masterDataPath('people'),
            query: { filter: { departmentId: ids, employmentStatus: 'left' } },
          },
        ]
      : [],
  );
  if (!ids) return null;
  const several = ids.length > 1;
  const list = (statuses: readonly string[]) => (
    <RelatedListTab
      target={{
        ...masterTarget('people'),
        defaultSort: 'employmentStatus,employeeNo',
        listFilter: { employmentStatus: statuses },
        // 部门 joins 姓名, 工号, 职位 and 在职状态.
        columns: several ? 5 : 4,
      }}
      filterField='departmentId'
      filterValue={ids}
      showFilterField={several}
      countKind='none'
      badges={['employmentStatus']}
    />
  );
  return (
    <div className='space-y-6'>
      {list(CURRENT)}
      {left ? (
        <TabSection title={t('enums.employmentStatus.left')} count={left}>
          {list(['left'])}
        </TabSection>
      ) : null}
    </div>
  );
}
