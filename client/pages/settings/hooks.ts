// The administration pages' shared functions and hooks (beside their shared
// components in ./shared.tsx): their copy, how an error is read, a small
// form state validated by zod on submit, the session's permission snapshot,
// dates in the reader's language, and the query keys scoped by user.
import { ApiClientError } from '@nocobase/app-client';
import {
  useAuthorizationClient,
  useAuthorizationRevision,
  type AuthorizationCheck,
  type AuthorizationSnapshot,
  type LocalizedText,
} from '@nocobase/app-plugin-authorization/client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { z } from 'zod';

/** The pages' copy: `admin.<key>` in the application's namespace (client/locales/admin.ts). */
export function useAdminText(): {
  readonly text: (key: string, options?: Record<string, unknown>) => string;
  readonly language: string;
} {
  const { t, i18n } = useTranslation();
  const adminText = useCallback(
    (key: string, options: Record<string, unknown> = {}) =>
      t(`admin.${key}`, options),
    [t],
  );
  return { text: adminText, language: i18n.language };
}

/** A title the server sends as text or as an i18n key in a namespace. */
export function useLocalized(): (
  value: LocalizedText | undefined,
  fallback?: string,
) => string {
  const { t } = useTranslation();
  return useCallback(
    (value, fallback = '') => {
      if (value === undefined) return fallback;
      if (typeof value === 'string') return value;
      return t(value.key, {
        ns: value.ns,
        defaultValue: value.defaultValue ?? fallback ?? value.key,
      });
    },
    [t],
  );
}

/** The reason of a standard error body, or undefined for anything else. */
export function errorReason(error: unknown): string | undefined {
  return error instanceof ApiClientError ? error.reason : undefined;
}

export function errorStatus(error: unknown): number {
  return error instanceof ApiClientError ? error.status : 0;
}

/** The fields a 400 names, from the standard error body's violations. */
export function errorFields(error: unknown): string[] {
  if (!(error instanceof ApiClientError)) return [];
  const payload = error.payload as
    { error?: { fieldViolations?: { field?: unknown }[] } } | undefined;
  return (payload?.error?.fieldViolations ?? [])
    .map((violation) => violation.field)
    .filter((field): field is string => typeof field === 'string');
}

/** One sentence for a failed write the dialog shows, never the server's own message. */
export function useFailureText(): (error: unknown) => string {
  const { text } = useAdminText();
  return useCallback(
    (error) => {
      const status = errorStatus(error);
      if (status === 0) return text('common.network');
      if (status === 401) return text('common.sessionEnded');
      if (status === 404) return text('common.notFound');
      return text('common.failed');
    },
    [text],
  );
}

/**
 * A small form's state, validated by a zod schema on submit (guideline T3.3): nothing is checked while it is first
 * filled in; after a failed submit each change revalidates, so an error disappears once corrected; a failed submit
 * moves focus to the first field in error, whose input has the id `${formId}-${field}`.
 */
export function useFormState<Schema extends z.ZodType<Record<string, unknown>>>(
  schema: Schema,
  initial: z.input<Schema>,
  formId: string,
): {
  readonly values: z.input<Schema>;
  readonly errors: Partial<Record<string, string>>;
  readonly dirty: boolean;
  readonly set: <K extends keyof z.input<Schema>>(
    field: K,
    value: z.input<Schema>[K],
  ) => void;
  /** Changes several fields at once. */
  readonly patch: (values: Partial<z.input<Schema>>) => void;
  /** Validates; returns the parsed values, or undefined after showing the errors. */
  readonly validate: () => z.output<Schema> | undefined;
  /** Shows a server's error under a field and focuses it. */
  readonly setError: (field: string, message: string) => void;
  /** Starts over from these values, as when the record they come from has loaded. */
  readonly reset: (values: z.input<Schema>) => void;
} {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [dirty, setDirty] = useState(false);

  const errorsOf = useCallback(
    (next: z.input<Schema>): Partial<Record<string, string>> => {
      const result = schema.safeParse(next);
      if (result.success) return {};
      const found: Partial<Record<string, string>> = {};
      for (const issue of result.error.issues) {
        const field = String(issue.path[0] ?? '');
        found[field] ??= issue.message;
      }
      return found;
    },
    [schema],
  );

  // A field in error takes focus once it can: a failed submit arrives while the dialog's fieldset is still disabled
  // for the submission, which the dialog re-enables in a render of its own, so the focus retries for half a second.
  const focusTimerRef = useRef(0);
  useEffect(() => () => window.clearTimeout(focusTimerRef.current), []);
  const focus = (field: string): void => {
    window.clearTimeout(focusTimerRef.current);
    const attempt = (left: number): void => {
      const element = document.getElementById(`${formId}-${field}`);
      if (element && !element.closest('fieldset:disabled')) element.focus();
      else if (left > 0)
        focusTimerRef.current = window.setTimeout(() => attempt(left - 1), 20);
    };
    focusTimerRef.current = window.setTimeout(() => attempt(25), 0);
  };

  return {
    values,
    errors,
    dirty,
    set: (field, value) => {
      const next = {
        ...(values as Record<string, unknown>),
        [field]: value,
      } as z.input<Schema>;
      setValues(next);
      setDirty(true);
      if (submitted) setErrors(errorsOf(next));
    },
    patch: (changes) => {
      const next = {
        ...(values as Record<string, unknown>),
        ...changes,
      } as z.input<Schema>;
      setValues(next);
      setDirty(true);
      if (submitted) setErrors(errorsOf(next));
    },
    validate: () => {
      setSubmitted(true);
      const result = schema.safeParse(values);
      if (result.success) {
        setErrors({});
        return result.data;
      }
      const found = errorsOf(values);
      setErrors(found);
      const first = result.error.issues[0]?.path[0];
      if (first !== undefined) focus(String(first));
      return undefined;
    },
    setError: (field, message) => {
      setErrors((current) => ({ ...current, [field]: message }));
      focus(field);
    },
    reset: (next) => {
      setValues(next);
      setErrors({});
      setSubmitted(false);
      setDirty(false);
    },
  };
}

/**
 * The session's permissions, read once and again whenever they are invalidated: `can` answers a check against the
 * snapshot synchronously, false until it has loaded. The server checks every action itself; this only decides what is
 * offered (guideline I7).
 */
export function useCanMany(): (check: AuthorizationCheck) => boolean {
  const authz = useAuthorizationClient();
  const revision = useAuthorizationRevision();
  const [snapshot, setSnapshot] = useState<{
    readonly revision: number;
    readonly value: AuthorizationSnapshot;
  }>();
  useEffect(() => {
    let active = true;
    void authz.snapshot().then(
      (value) => {
        if (active) setSnapshot({ revision, value });
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [authz, revision]);
  const value = snapshot?.value;
  return useCallback(
    (check) => {
      if (!value) return false;
      if (value.unrestricted) return true;
      return value.permissions.some(
        (permission) =>
          permission.resource.type === check.resource.type &&
          (permission.resource.id === check.resource.id ||
            permission.resource.id === '*') &&
          permission.actions.includes(check.action),
      );
    },
    [value],
  );
}

/** Dates in the current language, medium date and short time. */
export function useDateTime(): (value: string | null | undefined) => string {
  const { language } = useAdminText();
  return useCallback(
    (value) =>
      value
        ? new Intl.DateTimeFormat(language, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(value))
        : '—',
    [language],
  );
}

/**
 * The start of every query key these pages use: the signed-in user scopes the cache, so a browser that signs in as
 * someone else never shows the previous person's users, keys or sets.
 */
export function useAdminQueryKey(): readonly string[] {
  const { session } = useAuthentication();
  const userId = session?.user.id ?? 'anonymous';
  return useMemo(() => ['admin', userId], [userId]);
}
