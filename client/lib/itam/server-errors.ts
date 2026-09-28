import type { ApiErrorBody } from './api.js';

/**
 * Server errors arrive in English (services and routes are not localized);
 * the client translates them by exact message, by pattern for messages that
 * embed values, and by code for duplicates and missing records. Anything
 * unmatched is shown as sent.
 */
type Translate = (key: string, options?: Record<string, unknown>) => string;

let translate: Translate | undefined;

/** Installed by the application shell once translations are available. */
export function registerErrorTranslator(t: Translate): void {
  translate = t;
}

interface Pattern {
  readonly test: RegExp;
  readonly key: string;
  readonly params: readonly string[];
}

const PATTERNS: readonly Pattern[] = [
  { test: /^Only (\d+) available$/, key: 'onlyAvailable', params: ['count'] },
  {
    test: /^Only (\d+) left to receive on this line$/,
    key: 'onlyLeftToReceive',
    params: ['count'],
  },
  {
    test: /^Only (\d+) seats? (?:are )?free$/,
    key: 'onlySeatsFree',
    params: ['count'],
  },
  {
    test: /^(.+) is already disposed$/,
    key: 'alreadyDisposed',
    params: ['device'],
  },
  {
    test: /^(.+) is already listed on (.+)$/,
    key: 'alreadyListed',
    params: ['device', 'disposal'],
  },
  {
    test: /^Account (.+) already has a seat$/,
    key: 'accountHasSeat',
    params: ['account'],
  },
  {
    test: /^Operation "(.+)" is not allowed from status "(.*)"$/,
    key: 'operationNotAllowed',
    params: ['operation', 'status'],
  },
  {
    test: /^Cannot change the holder from status "(.*)"$/,
    key: 'holderStatus',
    params: ['status'],
  },
  { test: /^(\w+) not found$/, key: 'notFoundNamed', params: ['what'] },
  { test: /^(\w+) is required$/, key: 'fieldRequired', params: ['field'] },
  { test: /^(\w+) must be unique$/, key: 'duplicate', params: ['field'] },
  {
    test: /^Fields change only through operations: (.+)$/,
    key: 'lifecycleFields',
    params: ['fields'],
  },
  { test: /^Unknown files: (.+)$/, key: 'unknownFiles', params: ['files'] },
  {
    test: /^Not a receipt field: (.+)$/,
    key: 'notReceiptField',
    params: ['fields'],
  },
  {
    test: /^(\w+) (\S+) not found$/,
    key: 'recordNotFound',
    params: ['collection', 'id'],
  },
];

const KNOWN_FIELD = /^[a-z][A-Za-z]*$/;

/** Reference fields whose label is not their name without `Id`. */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  lenderVendorId: 'lender',
};

function fieldLabel(field: string): string {
  if (!translate || !KNOWN_FIELD.test(field)) return field;
  // `locationId` reads as its field, 存放位置, the way the form labels it.
  for (const key of [
    FIELD_LABELS[field],
    field,
    field.endsWith('Id') ? field.slice(0, -2) : undefined,
  ]) {
    if (!key) continue;
    const label = translate(`fields.${key}`, { defaultValue: '' });
    if (label) return label;
  }
  return field;
}

export function translateServerMessage(message: string): string {
  if (!translate) return message;
  const exact = translate(`serverErrors.messages.${message}`, {
    defaultValue: '',
  });
  if (exact) return exact;
  for (const pattern of PATTERNS) {
    const match = pattern.test.exec(message);
    if (!match) continue;
    const params: Record<string, string> = {};
    pattern.params.forEach((name, index) => {
      const raw = match[index + 1] ?? '';
      params[name] =
        name === 'field' || name === 'what'
          ? fieldLabel(raw)
          : name === 'status'
            ? translate!(`enums.deviceStatus.${raw}`, { defaultValue: raw })
            : name === 'operation'
              ? translate!(`enums.deviceOperation.${raw}`, {
                  defaultValue: raw,
                })
              : raw;
    });
    const translated = translate(`serverErrors.patterns.${pattern.key}`, {
      defaultValue: '',
      ...params,
    });
    if (translated) return translated;
  }
  return message;
}

/** Returns the body with its messages translated where a translation exists. */
export function localizeErrorBody(body: ApiErrorBody): ApiErrorBody {
  if (!translate) return body;
  return {
    ...body,
    message: body.message ? translateServerMessage(body.message) : body.message,
    issues: body.issues?.map((issue) => ({
      ...issue,
      message: translateServerMessage(issue.message),
    })),
  };
}
