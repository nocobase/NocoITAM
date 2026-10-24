import type { ReactElement } from 'react';
import { Navigate } from 'react-router';

// /settings/permission-sets, ITAM's own Permission sets page until it took
// NocoBase 3's prepared Roles page at /settings/roles (2026-10-24), kept for
// links and bookmarks.
export default function PermissionSetsRedirect(): ReactElement {
  return <Navigate to='/settings/roles' replace />;
}
