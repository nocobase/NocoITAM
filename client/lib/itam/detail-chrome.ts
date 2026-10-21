import { createContext } from 'react';

/**
 * Whether a detail page leaves out its breadcrumb (分类 › 外设). The
 * categories page shows a category beside the tree that already says where
 * it sits, so the line above the title would only repeat it; the record
 * drawer and the full page keep it, being mounted outside this context.
 */
export const HideBreadcrumbContext = createContext(false);

/**
 * Whether a detail page is mounted inside another page — the record drawer,
 * or the pane beside a master-data tree (`RecordPane`) — rather than being
 * the page itself. Such a page shows no 返回 of its own: the drawer has one,
 * and a pane's way back is its page's (2026-10-16).
 */
export const EmbeddedRecordContext = createContext(false);

/**
 * Opens the full page a pane shows, when the pane offers that in place of
 * the page's own header actions: the inbox's AI suggestions (2026-10-21),
 * decided on their card, whose page's 审批 or MDM 设置 would only lead
 * elsewhere from beside the list. Null everywhere else.
 */
export const OpenFullPageContext = createContext<(() => void) | null>(null);
