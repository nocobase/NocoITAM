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
