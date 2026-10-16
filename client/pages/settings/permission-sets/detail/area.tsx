// The area a set's Permissions drawer shows (…/permissions/:section): the
// drawer reads the area from the address and draws it, keeping one draft for
// all three; this route only sends an address naming no area to Pages.
import type { ReactElement } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';

import { isArea } from './areas.js';

export default function PermissionsArea(): ReactElement | null {
  const { section } = useParams();
  const location = useLocation();
  if (isArea(section)) return null;
  return (
    <Navigate to={{ pathname: '../pages', search: location.search }} replace />
  );
}
