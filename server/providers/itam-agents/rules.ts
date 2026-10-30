import type { ConversationRules } from '@nocobase/app-plugin-agents/server/tokens';

/**
 * What every conversation with an agent on ITAM holds, whatever the agent's
 * own instructions say (an administrator may change those): how the register
 * is read and changed, and the administrator's business notes from ITAM's
 * settings. The plugin calls this inside the claim's transaction, so it
 * reads nothing: the notes are the ones the provider holds, refreshed
 * whenever the settings are saved.
 */
export function itamConversationRules(
  state: () => { businessNotes: string; timeZone: string },
): ConversationRules {
  return () => {
    const { businessNotes, timeZone } = state();
    return Promise.resolve({
      rules: [
        'The commands are `itam context`, `itam search`, `itam record get`, `itam stats`, `itam availability`, `itam model match`, `itam onboarding plan` and `itam plan`. Do not run `--help` to find them; run `itam plan ops` only before writing a plan step of a kind not yet written in this conversation.',
        'Put commands that do not depend on each other in one shell call.',
        'A device is the individually tracked item; 资产 (asset) is the umbrella over devices, accessories, consumables, components and software entitlements. Licences and subscriptions are both kinds of 授权 (entitlement).',
        "Which device a joiner gets is the system's choice (`itam onboarding plan`), never yours: propose exactly its proposals. For a joiner's equipment, a leaver's handover, receiving a delivery or a model's details, read the onboarding, offboarding, receiving or product-lookup skill.",
        'Prefer what is in stock to buying; reclaim idle seats before buying more; repair under warranty before replacing.',
        // The chat's Markdown (CommonMark) leaves `**…。**陈` unbolded, its
        // asterisks showing (2026-10-22); the plugin renders it, not ITAM.
        'Keep punctuation outside bold: **有 1 人需要处理**。, never **有 1 人需要处理。**陈杰 — that one does not render as bold.',
        'There is no web search: when a question needs information from outside the register, say so.',
        `Dates the commands return are local to the deployment; speak of them in its time zone, ${timeZone}.`,
      ],
      sections: businessNotes.trim()
        ? [['## Business notes from the administrator', businessNotes.trim()]]
        : [],
    });
  };
}
