import type { ComponentType, ReactElement } from 'react';

/**
 * The Agents plugin's pages (智能体, 技能, 模型服务, 用量) in ITAM's look
 * (2026-10-16, after NocoCRM's `withCrmStyle`). The plugin draws its own
 * copies of the shadcn primitives as the registry writes them — a table with
 * a bare header in a plain bordered box, cards drawn by a ring, settings
 * boxes without a ground. Wrapped in this, they take ITAM's look through the
 * `.itam-plugin-page` rules in client/styles.css: white cards with the faint
 * border and shadow, line tabs as a record page's, the usage chart in the
 * primary colour. The plugin is not changed; the wrapper is a
 * `display: contents` element, so the pages lay out exactly as before, and
 * their covering child pages render inside it, so they follow too.
 */
export function withItamStyle(Page: ComponentType): ComponentType {
  function ItamStyledPage(): ReactElement {
    return (
      <div className='itam-plugin-page contents'>
        <Page />
      </div>
    );
  }
  return ItamStyledPage;
}
