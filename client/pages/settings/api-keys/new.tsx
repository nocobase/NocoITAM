// New API key (/settings/api-keys/new): a name, a description, an expiry
// and, where plugins offer permission groups, a scope that narrows the key
// to what the person chooses. Created, the dialog turns into the secret,
// shown once with Copy; the list behind has already refreshed.
import { useApiClient, useToaster } from '@nocobase/app-client';
import type {
  CreatedApiKey,
  KeyScopeGroupView,
  KeyScopeLevel,
  KeyScopeOptions,
} from '@nocobase/app-plugin-api-keys/shared/scopes';
import { useMemo, useState, type ReactElement } from 'react';
import { useOutletContext } from 'react-router';
import { z } from 'zod';

import {
  PermissionEditor,
  type PermissionEditorSection,
} from '#components/permission-editor';
import {
  Field,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '#components/ui/field';
import { Label } from '#components/ui/label';
import { RadioGroup, RadioGroupItem } from '#components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';

import {
  CopyField,
  FieldsSkeleton,
  FormDialog,
  LoadFailure,
  TextField,
} from '../shared.js';
import {
  errorReason,
  errorStatus,
  useAdminText,
  useFormState,
  useLocalized,
} from '../hooks.js';
import type { ApiKeysOutletContext } from './index.js';

const FORM_ID = 'settings-api-key-new';
const NAME_LIMIT = 64;
const DESCRIPTION_LIMIT = 255;
const DAY_CHOICES = [7, 30, 60, 90, 180, 365] as const;
const SELECT_CONTENT =
  'w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal';

export default function NewApiKeyDialog(): ReactElement {
  const { scopeOptions, scopeError, retryScope, created } =
    useOutletContext<ApiKeysOutletContext>();
  // The form starts from the scope options (its expiry and groups): until they are there, it waits (R-5).
  if (!scopeOptions)
    return <WaitingForOptions error={scopeError} retry={retryScope} />;
  return <NewKeyForm options={scopeOptions} onCreated={created} />;
}

function WaitingForOptions({
  error,
  retry,
}: {
  readonly error: unknown;
  readonly retry: () => void;
}): ReactElement {
  const { text } = useAdminText();
  return (
    <FormDialog
      title={text('keys.new')}
      formId={FORM_ID}
      submitLabel={text('common.create')}
      submit={() => Promise.resolve(false)}
      submitDisabled
      blocked={
        error ? (
          <LoadFailure error={error} what={text('keys.what')} onRetry={retry} />
        ) : (
          <FieldsSkeleton />
        )
      }
    />
  );
}

function NewKeyForm({
  options,
  onCreated,
}: {
  readonly options: KeyScopeOptions;
  readonly onCreated: () => void;
}): ReactElement {
  const { text } = useAdminText();
  const [secret, setSecret] = useState<CreatedApiKey>();
  const api = useApiClient();
  const toaster = useToaster();
  const localized = useLocalized();
  // Only the groups the person holds at least one level of can narrow a key.
  const groups = options.groups.filter((group) =>
    group.levels.some((level) => group.held[level]),
  );
  const schema = useMemo(
    () =>
      z
        .object({
          name: z
            .string()
            .trim()
            .min(1, text('keys.errors.name'))
            .max(NAME_LIMIT, text('keys.errors.tooLong', { max: NAME_LIMIT })),
          description: z
            .string()
            .trim()
            .max(
              DESCRIPTION_LIMIT,
              text('keys.errors.tooLong', { max: DESCRIPTION_LIMIT }),
            ),
          expires: z.string(),
          limited: z.boolean(),
          levels: z.record(z.string(), z.string()),
        })
        .refine(
          (values) => !values.limited || Object.keys(values.levels).length > 0,
          {
            error: text('keys.errors.access'),
            path: ['access'],
          },
        ),
    [text],
  );
  const form = useFormState(
    schema,
    {
      name: '',
      description: '',
      expires: String(options.defaultExpiresInDays),
      limited: false,
      levels: {},
    },
    FORM_ID,
  );
  const [rootError, setRootError] = useState<string>();

  // A scoped key may live at most `maxScopedKeyDays`; "never" only while that allows it, or for a full key.
  const maxDays = form.values.limited ? options.maxScopedKeyDays : null;
  // The usual choices, the server's proposal and its maximum, within the maximum.
  const dayChoices = [
    ...new Set([
      ...DAY_CHOICES,
      options.defaultExpiresInDays,
      ...(maxDays === null ? [] : [maxDays]),
    ]),
  ]
    .filter((days) => days > 0 && (maxDays === null || days <= maxDays))
    .sort((a, b) => a - b);
  const expiryItems = [
    ...dayChoices.map((days) => ({
      value: String(days),
      label: text('keys.days', { count: days }),
    })),
    ...(maxDays === null
      ? [{ value: 'never', label: text('keys.neverExpires') }]
      : []),
  ];
  const expires = expiryItems.some((item) => item.value === form.values.expires)
    ? form.values.expires
    : (expiryItems.at(-1)?.value ?? 'never');

  async function submit(): Promise<boolean> {
    const values = form.validate();
    if (!values) return false;
    setRootError(undefined);
    try {
      const result = await api.request<{ data: CreatedApiKey }>({
        path: 'apiKeys',
        method: 'POST',
        json: {
          name: values.name,
          description: values.description || null,
          expiresInDays: expires === 'never' ? null : Number(expires),
          scope: values.limited
            ? {
                groups: Object.fromEntries(
                  Object.entries(values.levels).map(([group, level]) => [
                    group,
                    { level },
                  ]),
                ),
              }
            : null,
        },
      });
      toaster.show({
        type: 'success',
        title: text('keys.toasts.created', { name: values.name }),
      });
      setSecret(result.data);
      onCreated();
    } catch (caught: unknown) {
      const reason = errorReason(caught);
      const status = errorStatus(caught);
      setRootError(
        reason === 'API_KEY_CREATION_FORBIDDEN'
          ? text('keys.errors.creation')
          : status === 0
            ? text('common.network')
            : status === 401
              ? text('common.sessionEnded')
              : text('common.failed'),
      );
    }
    // The dialog turns into the secret rather than closing.
    return false;
  }

  const sections = editorSections(groups, form.values.levels, localized, text);

  return (
    <FormDialog
      title={text(secret ? 'keys.secretTitle' : 'keys.new')}
      description={secret ? text('keys.secretWarning') : undefined}
      formId={FORM_ID}
      submitLabel={text('common.create')}
      submit={submit}
      rootError={rootError}
      blocked={
        secret ? (
          <CopyField
            id={`${FORM_ID}-secret`}
            value={secret.secret}
            label={text('keys.secretLabel')}
          />
        ) : undefined
      }
      closeLabel={text('common.done')}
    >
      <TextField
        formId={FORM_ID}
        name='name'
        label={text('keys.fields.name')}
        required
        maxLength={NAME_LIMIT}
        value={form.values.name}
        onChange={(value) => form.set('name', value)}
        error={form.errors.name}
      />
      <TextField
        formId={FORM_ID}
        name='description'
        label={text('keys.fields.description')}
        maxLength={DESCRIPTION_LIMIT}
        value={form.values.description}
        onChange={(value) => form.set('description', value)}
        error={form.errors.description}
      />
      <Field>
        <FieldLabel htmlFor={`${FORM_ID}-expires`}>
          {text('keys.fields.expires')}
          <span aria-hidden='true' className='text-destructive'>
            *
          </span>
        </FieldLabel>
        <Select
          items={expiryItems}
          value={expires}
          onValueChange={(value) => {
            if (value) form.set('expires', value);
          }}
        >
          <SelectTrigger id={`${FORM_ID}-expires`} className='w-full sm:w-56'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={SELECT_CONTENT}>
            <SelectGroup>
              {expiryItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      {groups.length > 0 ? (
        <FieldSet data-invalid={form.errors.access ? true : undefined}>
          <FieldLegend variant='label'>
            {text('keys.fields.access')}
          </FieldLegend>
          <RadioGroup
            value={form.values.limited ? 'limited' : 'full'}
            onValueChange={(value) => form.set('limited', value === 'limited')}
          >
            {(['full', 'limited'] as const).map((choice) => (
              <Field key={choice} orientation='horizontal'>
                <RadioGroupItem
                  value={choice}
                  id={`${FORM_ID}-access-${choice}`}
                />
                <Label
                  htmlFor={`${FORM_ID}-access-${choice}`}
                  className='font-normal'
                >
                  {text(choice === 'full' ? 'keys.full' : 'keys.limited')}
                </Label>
              </Field>
            ))}
          </RadioGroup>
          {form.values.limited ? (
            <div
              id={`${FORM_ID}-access`}
              tabIndex={-1}
              className='outline-none'
            >
              <PermissionEditor
                sections={sections}
                labels={{
                  levelFor: (label) => text('sets.levelFor', { name: label }),
                }}
                onEnabledChange={(id, on) => {
                  const group = groups.find((item) => item.id === id);
                  const next = { ...form.values.levels };
                  if (on && group)
                    next[id] = highestHeld(group) ?? group.levels[0] ?? 'read';
                  else delete next[id];
                  form.set('levels', next);
                }}
                onLevelChange={(id, level) =>
                  form.set('levels', { ...form.values.levels, [id]: level })
                }
              />
            </div>
          ) : null}
          <FieldError>{form.errors.access}</FieldError>
        </FieldSet>
      ) : null}
    </FormDialog>
  );
}

/** The highest level the person holds today, which a newly switched-on group starts at. */
function highestHeld(group: KeyScopeGroupView): KeyScopeLevel | undefined {
  return [...group.levels].reverse().find((level) => group.held[level]);
}

/** The groups as editor rows, one section per category, offering only the levels the person holds. */
function editorSections(
  groups: readonly KeyScopeGroupView[],
  levels: Readonly<Record<string, string>>,
  localized: ReturnType<typeof useLocalized>,
  text: (key: string) => string,
): PermissionEditorSection[] {
  const categories = [...new Set(groups.map((group) => group.category))];
  return categories.map((category) => ({
    id: category,
    title: text(
      category === 'business'
        ? 'sets.headings.business'
        : category === 'administration'
          ? 'sets.headings.administration'
          : 'keys.fields.access',
    ),
    groups: [
      {
        id: `${category}-rows`,
        rows: groups
          .filter((group) => group.category === category)
          .map((group) => ({
            id: group.id,
            label: localized(group.title, group.id),
            hint: group.description ? localized(group.description) : undefined,
            enabled: levels[group.id] !== undefined,
            level: levels[group.id],
            levels: group.levels
              .filter((level) => group.held[level])
              .map((level) => ({
                value: level,
                label: text(`keys.levels.${level}`),
              })),
          })),
      },
    ],
  }));
}
