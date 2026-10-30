import type { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router';

/**
 * /procurement, the address purchase orders had until 2026-10-30, kept for
 * the links already sent: the same record, tab and query at /purchases.
 */
export default function MovedToPurchases(): ReactElement {
  const { pathname, search, hash } = useLocation();
  return (
    <Navigate
      to={`${pathname.replace(/^\/procurement/, '/purchases')}${search}${hash}`}
      replace
    />
  );
}
