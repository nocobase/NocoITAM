/**
 * The kind a record is known by to the assistant and to comments — the
 * collection its history and its chat context are kept under
 * (`server/providers/itam/comments.ts`, `itam-agents/context.ts`) — by the
 * API path its pages read it from. Undefined for anything else.
 */
const BY_PATH: Readonly<Record<string, string>> = {
  'itam/devices': 'devices',
  'itam/stock': 'stockItems',
  'itam/entitlements': 'entitlements',
  'itam/purchase-orders': 'purchaseOrders',
  'itam/repairs': 'repairs',
  'itam/disposals': 'disposals',
  'itam/audits': 'auditTasks',
};
const MASTER_KINDS = new Set([
  'people',
  'models',
  'softwareProducts',
  'categories',
  'manufacturers',
  'vendors',
  'locations',
  'departments',
]);

export function recordKindOf(path: string): string | undefined {
  const master = /^itam\/master\/(\w+)$/.exec(path)?.[1];
  if (master) return MASTER_KINDS.has(master) ? master : undefined;
  return BY_PATH[path];
}
