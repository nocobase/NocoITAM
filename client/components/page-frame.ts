import { createContext } from 'react';

// Application change: a page that gathers several pages under tabs (the
// settings, client/pages/settings/index.tsx) draws the title and the tabs
// itself, the tabs sticking to the top as the page scrolls; inside it, a
// tab's PageHeader draws only its description and actions, and its
// PageContainer starts closer under the tabs. A covering child page
// (RouteChildPage) is a page of its own and clears it.
export const PageFrameContext = createContext(false);
