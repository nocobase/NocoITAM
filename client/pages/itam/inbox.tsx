import type { ReactElement } from 'react';

import { MyWork } from '@/components/itam/my-work';
import { Page } from '@/components/itam/page-header';

/**
 * 待我处理: the work waiting on this reader.
 *
 * The cards are the workbench's own, rendered by the same component rather
 * than a second time: the workbench answers "is anything waiting" the moment
 * somebody signs in, and this is where they come to work through it without
 * the rest of the overview around them. It carries no total, for the same
 * reason the card strip carries none — a sum of unrelated rules is not
 * something anybody acts on, and every row has its own number.
 */
export default function InboxPage(): ReactElement {
  return (
    <Page>
      <MyWork />
    </Page>
  );
}
