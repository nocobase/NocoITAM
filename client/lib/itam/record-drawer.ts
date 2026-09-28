import { createContext, useCallback, useContext } from 'react';
import { useNavigate } from 'react-router';

import { recordTarget } from './record-view.js';

/**
 * The record drawer the application shell provides (`RecordDrawerProvider`
 * in `client/components/itam/record-drawer.tsx`). Links (`RecordLink`) and
 * row clicks (`useOpenRecord`) open related records there instead of
 * leaving the page; without a provider (a test, another surface) they
 * navigate as usual.
 */
export interface RecordDrawerApi {
  readonly open: (to: string) => void;
}

export const RecordDrawerContext = createContext<RecordDrawerApi | null>(null);

/**
 * Opens a record: in the drawer when one is available and the path is a
 * record's, otherwise by navigating. For clickable rows and buttons; links
 * use `RecordLink` so they keep an address.
 */
export function useOpenRecord(): (to: string) => void {
  const drawer = useContext(RecordDrawerContext);
  const navigate = useNavigate();
  return useCallback(
    (to: string) => {
      if (drawer && recordTarget(to)) drawer.open(to);
      else void navigate(to);
    },
    [drawer, navigate],
  );
}
