import { useContext, type ComponentProps, type ReactElement } from 'react';

import { cn } from 'cn';

import { PageFrameContext } from './page-frame.js';

export type PageContainerProps = ComponentProps<'section'>;

/**
 * The frame of a page: the full width, the responsive padding, and the spacing between its sections.
 *
 * A page renders one. Content that renders inside another page — an inline child route, a tab panel — already sits in
 * that page's container and adds none of its own, while a covering `RouteChildPage` is a surface of its own and
 * places one inside it.
 */
export function PageContainer({
  className,
  ...props
}: PageContainerProps): ReactElement {
  // Application change: under the sticking tabs of a page that gathers pages
  // (page-frame.ts), it starts closer to them.
  const frame = useContext(PageFrameContext);
  return (
    <section
      className={cn(
        frame
          ? 'w-full space-y-6 px-6 pt-3 pb-6 md:px-8 md:pt-3 md:pb-8'
          : 'w-full space-y-6 p-6 md:p-8',
        className,
      )}
      {...props}
    />
  );
}
