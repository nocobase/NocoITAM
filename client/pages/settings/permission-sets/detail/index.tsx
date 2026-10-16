// A permission set's address (/settings/permission-sets/:setKey): no view of
// its own. Its permissions and its members are drawers over the list
// (permissions.tsx, members.tsx), declared under it; the address alone opens
// the permissions, keeping the list's search. It was a page with tabs of its
// own until 2026-10-16.
import type { ReactElement } from 'react';
import {
  Navigate,
  Outlet,
  useLocation,
  useOutletContext,
  useResolvedPath,
} from 'react-router';

import type { PermissionSetsOutletContext } from '../data.js';

export default function PermissionSetRoute(): ReactElement {
  const context = useOutletContext<PermissionSetsOutletContext>();
  const location = useLocation();
  const own = useResolvedPath('.');
  if (location.pathname.replace(/\/$/u, '') === own.pathname)
    return (
      <Navigate
        to={{ pathname: 'permissions/pages', search: location.search }}
        replace
      />
    );
  return <Outlet context={context} />;
}
