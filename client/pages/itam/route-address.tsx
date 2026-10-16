/**
 * A child route that only gives its parent page an address (2026-10-16, as
 * NocoCRM's `crm-record-tab.tsx`): the parent reads the parameter and draws
 * what it names itself, so this renders nothing in the page's outlet. The
 * conversations page uses it for `/agent-chat/:conversationId`.
 */
export default function RouteAddress(): null {
  return null;
}
