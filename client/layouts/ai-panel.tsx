import { useTranslation } from '@nocobase/i18n/client';
import { Maximize2, PanelRight, X } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useSyncExternalStore,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
} from 'react';

import { ItamWriteCard } from '@/components/itam/ai/write-card';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { apiClientToken, useService } from '@nocobase/app-client';

import {
  AIChatProvider,
  NocoBaseAIChatIcon,
  AIChatWindow,
  ChatSurface,
  type AIChatController,
  NocoBaseAIRootProvider,
  NocoBaseAIService,
  useAI,
  useAIChatBase,
  useAIChatControllerState,
  useAIChatMessages,
  useAIChatStatus,
  type AIEmployee,
  type AIService,
  type AIToolRendererMap,
} from '@/extensions/nocobase-ai';
import {
  createAIChatController,
  ItamAiProvider,
  useItamAi,
  type HiddenChatName,
} from '@/lib/itam/ai-chat';
import { cn } from '@/lib/utils';

/**
 * Application-level AI chat: the ITAM employee in a right-hand side panel
 * that stays open across navigation. This is application chrome, not a
 * page, which is why it lives beside the shell; the panel and the header
 * toggle only render once a model is configured and AI is enabled.
 */
// The ITAM write tools, each rendered by the confirmation card: standalone
// so the values and the decision sit together, handling the approval itself.
const TOOL_RENDERERS: AIToolRendererMap = Object.fromEntries(
  [
    'itam_assign_device',
    'itam_loan_device',
    'itam_return_devices',
    'itam_transfer_device',
    'itam_reserve_device',
    'itam_correct_device_status',
    'itam_assign_seat',
    'itam_reclaim_seats',
    'itam_create_purchase_order',
    'itam_create_disposal',
    'itam_create_record',
    'itam_stock_in',
    'itam_issue_stock',
    'itam_take_back_stock',
    'itam_receive_purchase_line',
  ].map((name) => [
    name,
    { component: ItamWriteCard, handlesApproval: true, standalone: true },
  ]),
);

/**
 * Noco's name, role, bio and greeting in the interface language. The plugin
 * keeps a code-registered employee's texts in the one language of its
 * definition (`ai/employees/itam.ts`, English; the AI employees settings
 * page shows that), so this panel swaps in the translated ones by wrapping
 * the service that lists employees — the CRM does the same.
 */
function localizedService(
  base: AIService,
  texts: Pick<AIEmployee, 'nickname' | 'position' | 'bio' | 'greeting'>,
): AIService {
  const listEmployees = async (): Promise<AIEmployee[]> =>
    (await base.listEmployees()).map((employee) =>
      employee.username === 'itam' ? { ...employee, ...texts } : employee,
    );
  return new Proxy(base, {
    get(target, property, receiver) {
      if (property === 'listEmployees') return listEmployees;
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

export function ItamAiShell({ children }: PropsWithChildren): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const controller = useMemo(() => createAIChatController(), []);
  const nickname = t('ai.employee.nickname');
  const position = t('ai.employee.position');
  const bio = t('ai.employee.bio');
  const greeting = t('ai.employee.greeting');
  // A new service makes the root provider list employees again, so this
  // changes with the language and nothing else.
  const service = useMemo(
    () =>
      localizedService(new NocoBaseAIService(api), {
        nickname,
        position,
        bio,
        greeting,
      }),
    [api, nickname, position, bio, greeting],
  );
  return (
    <NocoBaseAIRootProvider service={service} toolRenderers={TOOL_RENDERERS}>
      <ItamAiProvider controller={controller}>
        {children}
        <AiSidePanel />
        <HiddenChat name='search' />
        <HiddenChat name='receipt' />
      </ItamAiProvider>
    </NocoBaseAIRootProvider>
  );
}

function AiSidePanel(): ReactElement | null {
  const { t } = useTranslation();
  const ai = useItamAi();
  const controller = ai?.controller;
  const { open } = useAIChatControllerState(controller);
  if (!ai?.available || !controller) return null;
  const setPanelOpen = (next: boolean): void => {
    if (!next) ai.setExpanded(false);
    controller.setOpen(next);
  };
  return (
    <>
      {/* The plugin's surface: a side panel beside the page, or expanded, a
          dialog over it — the same chat window stays mounted either way.
          Escape closes only the dialog: in the panel it would also fire
          while cancelling an edit on the page. */}
      <ChatSurface
        open={open}
        variant={ai.expanded ? 'dialog' : 'side-panel'}
        onOpenChange={setPanelOpen}
        width={440}
        closeOnEscape={ai.expanded}
      >
        <ConfiguredChat
          controller={controller}
          headerActions={
            <>
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label={t(ai.expanded ? 'ai.collapse' : 'ai.expand')}
                title={t(ai.expanded ? 'ai.collapse' : 'ai.expand')}
                onClick={() => ai.setExpanded(!ai.expanded)}
              >
                {ai.expanded ? <PanelRight /> : <Maximize2 />}
              </Button>
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label={t('ai.close')}
                title={t('ai.close')}
                onClick={() => setPanelOpen(false)}
              >
                <X />
              </Button>
            </>
          }
        />
      </ChatSurface>
    </>
  );
}

/**
 * The assistant's global entry: a button in the header, beside the reader's
 * own menu (2026-10-06). It was the plugin's floating launcher at the lower
 * right, which covered whatever a page put in that corner and moved when
 * dragged. It opens the panel on the conversation in progress, as the page
 * shortcuts do, and closes it again; nothing shows without a usable model.
 */
export function AiHeaderButton({
  className,
}: {
  readonly className: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const ai = useItamAi();
  const { open } = useAIChatControllerState(ai?.controller);
  if (!ai?.available) return null;
  const label = t(open ? 'ai.closeChat' : 'ai.openChat');
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type='button'
            className={className}
            aria-pressed={open}
            onClick={() => {
              if (open) {
                ai.setExpanded(false);
                ai.controller.setOpen(false);
              } else ai.controller.open();
            }}
          />
        }
        aria-label={label}
      >
        <NocoBaseAIChatIcon className='size-6' aria-hidden='true' />
      </TooltipTrigger>
      <TooltipContent side='bottom'>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Pads the content so the open panel pushes it left instead of covering it. */
export function AiPanelSpacer({
  children,
  className,
}: PropsWithChildren<{ readonly className?: string }>): ReactElement {
  const ai = useItamAi();
  const { open } = useAIChatControllerState(ai?.controller);
  return (
    <div
      className={cn(
        className,
        'transition-[padding] duration-200',
        // The expanded dialog lies over the page; only the panel pushes it.
        ai?.available && open && !ai.expanded ? 'lg:pr-[440px]' : '',
      )}
    >
      {children}
    </div>
  );
}

/**
 * The chat, mounted only once the plugin has found Noco and a usable model.
 * A chat mounted earlier shows the right defaults while its own selection
 * and transport still hold the empty configuration it started with, so the
 * send button does nothing (the plugin's guide warns of this; the CRM gates
 * the same way). Until then the panel says why it cannot start.
 */
function ConfiguredChat({
  controller,
  headerActions,
}: {
  readonly controller: AIChatController;
  readonly headerActions: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  const {
    configurationStatus,
    configurationError,
    modelConfigurationError,
    employees,
    hasEnabledModels,
  } = useAI();
  const notice = (message: string, alert = true): ReactElement => (
    <div className='flex h-full flex-col'>
      <div className='flex justify-end gap-1 border-b border-border px-3 py-2'>
        {headerActions}
      </div>
      <p
        role={alert ? 'alert' : 'status'}
        className='m-4 rounded-lg bg-muted p-4 text-sm text-muted-foreground'
      >
        {message}
      </p>
    </div>
  );
  if (configurationStatus === 'loading')
    return notice(t('ai.chat.loading'), false);
  if (configurationStatus === 'error')
    return notice(configurationError?.message ?? t('ai.chat.configError'));
  if (!employees.some((employee) => employee.username === 'itam'))
    return notice(t('ai.chat.noEmployee'));
  if (modelConfigurationError || !hasEnabledModels)
    return notice(modelConfigurationError?.message ?? t('ai.chat.noModel'));
  return (
    <AIChatProvider id='itam' controller={controller} defaultEmployee='itam'>
      <PendingConversation />
      <AIChatWindow
        className='h-full'
        enableAttachments
        showEmployeeSelector={false}
        headerActions={headerActions}
      />
    </AIChatProvider>
  );
}

/**
 * A chat nobody sees: the same employee in a conversation of its own, so the
 * search's 问 AI and receiving by delivery document neither open the panel
 * nor replace what is in it. Mounted on the same conditions as the panel's
 * chat, for the same reason (`ConfiguredChat`), and without a window:
 * sending, tool calls and their automatic approval all happen in the
 * provider. Its progress reaches the page through `ChatStateBridge`.
 */
function HiddenChat({
  name,
}: {
  readonly name: HiddenChatName;
}): ReactElement | null {
  const ai = useItamAi();
  const {
    configurationStatus,
    employees,
    hasEnabledModels,
    modelConfigurationError,
  } = useAI();
  if (
    !ai?.available ||
    configurationStatus !== 'ready' ||
    !employees.some((employee) => employee.username === 'itam') ||
    modelConfigurationError ||
    !hasEnabledModels
  )
    return null;
  return (
    <AIChatProvider
      id={`itam-${name}`}
      controller={ai[name].controller}
      defaultEmployee='itam'
    >
      <ChatStateBridge name={name} />
    </AIChatProvider>
  );
}

/** Publishes an unseen chat's progress for its page (`useHiddenChat`). */
function ChatStateBridge({ name }: { readonly name: HiddenChatName }): null {
  const ai = useItamAi();
  const { messages } = useAIChatMessages();
  const { status, error } = useAIChatStatus();
  const { activeConversationId, removeConversation } = useAIChatBase();
  useEffect(() => {
    ai?.[name].state.set({
      status,
      messages,
      error,
      conversationId: activeConversationId,
      removeConversation,
    });
  }, [
    ai,
    name,
    status,
    messages,
    error,
    activeConversationId,
    removeConversation,
  ]);
  return null;
}

/**
 * Opens the conversation a page asked for (`openConversation`) once the
 * panel's chat is mounted: one the search kept because Noco proposed a
 * change only that conversation can confirm.
 */
function PendingConversation(): null {
  const ai = useItamAi();
  const { selectConversation } = useAIChatBase();
  const pending = useSyncExternalStore(
    ai?.pendingConversation.subscribe ?? noSubscription,
    ai?.pendingConversation.get ?? nothing,
  );
  useEffect(() => {
    if (!pending) return;
    selectConversation(pending);
    ai?.pendingConversation.set(undefined);
  }, [ai, pending, selectConversation]);
  return null;
}

const noSubscription = () => () => undefined;
const nothing = () => undefined;
