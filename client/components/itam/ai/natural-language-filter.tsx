import { useTranslation } from '@nocobase/i18n/client';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';

import { AiShortcut } from '@/components/itam/ai/ai-shortcut';
import { Input } from '@/components/ui/input';
import {
  useAIPageElementHandle,
  type AIFrontendToolRegistration,
} from '@/extensions/nocobase-ai';
import { useItamAi } from '@/lib/itam/ai-chat';
import type { FieldDefinition } from '@/lib/itam/fields';

/**
 * "Describe what you are looking for", answered by the ITAM assistant. The
 * list registers itself as page context — its filterable fields, their
 * options and the filter in force — with one frontend tool, `applyFilter`,
 * which only rewrites the list's own filter (ALLOW: nothing is saved). The
 * sentence goes to the assistant with that context; it looks up ids with
 * its read tools and applies the filter. Hidden when no model is
 * configured: the search bar and the filters stay.
 */
export function NaturalLanguageFilter({
  collection,
  fields,
  filter,
  onApply,
}: {
  readonly collection: string;
  readonly fields: readonly FieldDefinition[];
  /** The filter in force, as the list's URL parameters. */
  readonly filter: Readonly<Record<string, string>>;
  readonly onApply: (filter: Record<string, string>) => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const ai = useItamAi();
  const [text, setText] = useState('');
  // The tool runs whenever the assistant calls it; it must see the latest
  // callback and filter, not the ones of the render that registered it.
  const latestRef = useRef({ onApply, filter });
  useEffect(() => {
    latestRef.current = { onApply, filter };
  });
  // A plain registration rather than `defineAIFrontendTool(...)`: that
  // helper only types the object, and the compiler cannot tell it does not
  // run `execute` during render.
  const tools = useMemo(
    (): AIFrontendToolRegistration[] => [
      {
        name: 'applyFilter',
        title: 'Apply a list filter',
        description:
          'Replace the filter of the list on screen. Keys are the field keys from the page context; a value is an option value or a record id (several joined by commas), a date field also takes "<key>:gte" / "<key>:lte" with YYYY-MM-DD, and "q" is free text. Look ids up with the ITAM read tools first; an empty object clears the filter.',
        permission: 'ALLOW',
        inputSchema: {
          type: 'object',
          properties: {
            filter: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
          },
          required: ['filter'],
        },
        // The assistant supplies the arguments; read them defensively.
        execute: (args: unknown) => {
          const next = (args as { filter?: Record<string, unknown> } | null)
            ?.filter;
          const applied: Record<string, string> = {};
          for (const [key, value] of Object.entries(next ?? {})) {
            if (Array.isArray(value)) applied[key] = value.join(',');
            else if (typeof value === 'string' && value) applied[key] = value;
            else if (typeof value === 'number') applied[key] = String(value);
          }
          latestRef.current.onApply(applied);
          return { applied };
        },
      },
    ],
    [],
  );
  const { ref: contextRef, context } = useAIPageElementHandle({
    id: `itam-list-${collection}`,
    title: t('ai.listContext', { collection: t(`references.${collection}`) }),
    kind: 'list',
    getContext: () => ({
      collection,
      filterInForce: latestRef.current.filter,
      fields: fields
        .filter((field) => field.column || field.options || field.reference)
        .map((field) => ({
          key: field.key,
          label: t(field.label),
          type: field.type,
          options: field.options?.map((option) => option.value),
          references: field.reference?.collection,
        })),
    }),
    tools,
  });
  if (!ai?.available) return null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    ai.ask(t('ai.prompts.filterList', { text: text.trim() }), {
      workContext: [context],
    });
  };
  return (
    <form
      ref={contextRef}
      className='flex flex-wrap items-center gap-2'
      onSubmit={submit}
    >
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t('ai.filterPlaceholder')}
        aria-label={t('ai.filterLabel')}
        className='w-72'
      />
      <AiShortcut type='submit' disabled={!text.trim()}>
        {t('ai.filter')}
      </AiShortcut>
    </form>
  );
}
