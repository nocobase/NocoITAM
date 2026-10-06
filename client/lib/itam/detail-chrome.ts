import { createContext } from 'react';

/**
 * Whether a detail page leaves out its breadcrumb (分类 › 外设). The
 * categories page shows a category beside the tree that already says where
 * it sits, so the line above the title would only repeat it; the record
 * drawer and the full page keep it, being mounted outside this context.
 */
export const HideBreadcrumbContext = createContext(false);
