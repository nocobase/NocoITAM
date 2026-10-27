import type {
  ChatAvailability,
  ConversationDetail,
} from '@nocobase/app-plugin-agents/shared/conversations';
import { UnplugIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { AvailabilityDot as AgentAvailabilityDot } from '#components/agent-picker';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';

import { useAgentPickerLabels, useChatTranslation } from './chat-i18n.js';
// Application change (ITAM, Agents plugin 1.0): Asset Steward's name for
// the plugin's native online agent (lib/itam/agent-text.ts).
import { useAgentText } from '@/lib/itam/agent-text';

/** A green or grey dot with its meaning for screen readers (`agent-picker`'s, in the chat's wording). */
export function AvailabilityDot({
  availability,
  className,
}: {
  readonly availability: ChatAvailability;
  readonly className?: string;
}): ReactElement {
  const labels = useAgentPickerLabels();
  return (
    <AgentAvailabilityDot
      availability={availability}
      labels={labels}
      {...(className === undefined ? {} : { className })}
    />
  );
}

export interface AgentNoticeProps {
  readonly conversation: ConversationDetail;
}

/** Chat never silently switches to a Runner or another profile. */
export function AgentNotice({
  conversation,
}: AgentNoticeProps): ReactElement | null {
  const { t } = useChatTranslation();
  const name = useAgentText().name(conversation.agent) ?? t('chat.agentGone');
  if (!conversation.execution)
    return (
      <Alert>
        <UnplugIcon />
        <AlertTitle>{t('chat.historicalReadOnly')}</AlertTitle>
      </Alert>
    );
  if (conversation.execution.outcome === 'failed')
    return (
      <Alert>
        <UnplugIcon />
        <AlertTitle>{t('chat.executionFailed')}</AlertTitle>
      </Alert>
    );
  if (conversation.execution.requiresEffectReview)
    return (
      <Alert>
        <AlertTitle>{t('chat.feedback.effectReview')}</AlertTitle>
      </Alert>
    );
  if (conversation.availability.online) return null;
  return (
    <Alert data-testid='chat-offline'>
      <UnplugIcon />
      <AlertTitle>
        {t(
          `chat.offline.${conversation.availability.reason ?? 'modelUnavailable'}`,
          { name },
        )}
      </AlertTitle>
      <AlertDescription>{t('chat.connectionUnknown')}</AlertDescription>
    </Alert>
  );
}
