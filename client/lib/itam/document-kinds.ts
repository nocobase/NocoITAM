/**
 * The four kinds of work document a record can be tagged with — what
 * `DocumentTypeBadge` draws. Here rather than beside the component because
 * a component module may export only components (fast refresh).
 */
export const DOCUMENT_KINDS = [
  'purchaseOrders',
  'repairs',
  'auditTasks',
  'disposals',
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export function isDocumentKind(value: string): value is DocumentKind {
  return (DOCUMENT_KINDS as readonly string[]).includes(value);
}
