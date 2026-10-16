// What the administration pages (Users, Permission sets, API keys,
// Scheduled tasks) share as components: how a failed load reads, the table
// skeleton, a confirmation that runs its action, a field that copies a
// secret, a form in a route dialog, a text field, truncated cells and
// route tabs. Template 1.0.0-beta.60 removed the settings area and the
// plugins' own pages; these pages are the application's, built on the
// plugins' APIs. Functions and hooks are in ./hooks.ts.
import { useToaster } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { AlertCircleIcon, CheckIcon, CopyIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link, type To } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Button } from '#components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '#components/ui/field';
import { Input } from '#components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '#components/ui/input-group';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import { useRouteOverlay } from '#components/use-route-overlay';

import { errorStatus, useAdminText, useFailureText } from './hooks.js';

/**
 * A failed load in the page (guideline S4): 401 offers signing in again, 403 and 404 explain without a retry, anything
 * else offers Retry. `back` is where a missing record's page leads.
 */
export function LoadFailure({
  error,
  what,
  onRetry,
  back,
  notFound = false,
}: {
  readonly error: unknown;
  /** The record is gone though nothing failed, as a user missing from the list. */
  readonly notFound?: boolean;
  readonly what: string;
  readonly onRetry?: () => void;
  readonly back?: { readonly to: string; readonly label: string };
}): ReactElement {
  const { text } = useAdminText();
  const { refresh } = useAuthentication();
  const status = notFound ? 404 : errorStatus(error);
  const action =
    status === 401 ? (
      <Button variant='outline' size='sm' onClick={() => void refresh()}>
        {text('common.signInAgain')}
      </Button>
    ) : status === 404 && back ? (
      <Button
        variant='outline'
        size='sm'
        nativeButton={false}
        render={<Link to={back.to} />}
      >
        {back.label}
      </Button>
    ) : status === 403 || status === 404 || !onRetry ? null : (
      <Button variant='outline' size='sm' onClick={onRetry}>
        {text('common.retry')}
      </Button>
    );
  return (
    <Alert variant='destructive'>
      <AlertCircleIcon />
      <AlertTitle>{text('common.loadFailed', { what })}</AlertTitle>
      <AlertDescription>
        {status === 401
          ? text('common.sessionEnded')
          : status === 403
            ? text('common.forbidden', { what })
            : status === 404
              ? text('common.notFound')
              : text('common.network')}
      </AlertDescription>
      {action ? <AlertAction>{action}</AlertAction> : null}
    </Alert>
  );
}

/** Skeleton rows shaped like a table, named "Loading" (guideline S1). */
export function TableSkeleton({
  columns = 4,
  rows = 5,
}: {
  readonly columns?: number;
  readonly rows?: number;
}): ReactElement {
  const { text } = useAdminText();
  return (
    <div
      role='status'
      aria-label={text('common.loading')}
      className='overflow-hidden rounded-lg border border-border bg-card'
    >
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className='flex items-center gap-4 border-b px-4 py-3 last:border-b-0'
        >
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={column}
              className={column === 0 ? 'h-4 w-40' : 'h-4 w-24'}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * A confirmation that runs its action (guideline I2): the title names the object, the button the action, and a
 * failure stays inside the dialog as a line of text. The caller keeps `target` after closing, so the title does not
 * go blank while the dialog animates out.
 */
export function ConfirmAction({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
  failure,
  finalFocus,
  onGone,
}: {
  /** The record turned out to be gone (404): the list behind refreshes; the action is not offered again (R3). */
  readonly onGone?: () => void;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly confirmLabel: ReactNode;
  readonly destructive?: boolean;
  /** Runs the action; once it resolves the dialog closes itself. A rejection is shown in the dialog. */
  readonly onConfirm: () => Promise<void>;
  /** The sentence for a rejection; defaults to the generic failure. */
  readonly failure?: (error: unknown) => string | undefined;
  /** Where focus goes once the dialog closed after the action, when the button that opened it is gone (A6). */
  readonly finalFocus?: () => HTMLElement | null | undefined;
}): ReactElement {
  const { text } = useAdminText();
  const failureText = useFailureText();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [gone, setGone] = useState(false);
  const doneRef = useRef(false);

  async function confirm(): Promise<void> {
    setPending(true);
    setError(undefined);
    try {
      await onConfirm();
      // Done: close, with focus going where `finalFocus` says (A6).
      doneRef.current = true;
      setPending(false);
      onOpenChange(false);
      return;
    } catch (caught: unknown) {
      if (errorStatus(caught) === 404) {
        setGone(true);
        setError(text('common.notFound'));
        onGone?.();
        return;
      }
      setError(failure?.(caught) ?? failureText(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // No closing while the action runs; a closed dialog starts clean.
        if (!next && pending) return;
        if (!next) {
          setError(undefined);
          setGone(false);
        }
        onOpenChange(next);
      }}
    >
      <AlertDialogContent
        finalFocus={() => {
          const target = doneRef.current ? finalFocus?.() : null;
          doneRef.current = false;
          return target ?? true;
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {text('common.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending || gone}
            onClick={() => void confirm()}
          >
            {pending ? <Spinner data-icon='inline-start' /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** A read-only value with a Copy button: a new API key's secret, an invitation link. */
export function CopyField({
  value,
  label,
  id,
}: {
  readonly value: string;
  readonly label: string;
  readonly id: string;
}): ReactElement {
  const { text } = useAdminText();
  const toaster = useToaster();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <InputGroup>
      <InputGroupInput
        id={id}
        readOnly
        value={value}
        aria-label={label}
        className='font-mono text-xs'
        onFocus={(event) => event.currentTarget.select()}
      />
      <InputGroupAddon align='inline-end'>
        <InputGroupButton
          aria-label={text('common.copy')}
          onClick={() => {
            void navigator.clipboard.writeText(value).then(
              () => {
                setCopied(true);
                toaster.show({ type: 'success', title: text('common.copied') });
              },
              () => document.getElementById(id)?.focus(),
            );
          }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {text('common.copy')}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

/**
 * Text cut with an ellipsis where its cell ends, showing the whole of it on hover only when it was cut (guideline
 * T1.11). The cell sets the width; this fills it.
 */
export function TruncatedText({
  children,
  className = '',
}: {
  readonly children: string;
  readonly className?: string;
}): ReactElement {
  const [cut, setCut] = useState(false);
  return (
    <span
      className={`block truncate ${className}`}
      title={cut ? children : undefined}
      onPointerEnter={(event) =>
        setCut(
          event.currentTarget.scrollWidth > event.currentTarget.clientWidth,
        )
      }
    >
      {children}
    </span>
  );
}

/**
 * A create or edit form in a `RouteDialog` (guidelines T3.4–T3.7): Cancel and the submit button on the right, both
 * disabled and the dialog unclosable while submitting, Enter submits, a failure that belongs to no field in an Alert
 * at the top, and the dialog closes once `submit` resolves true. `blocked` replaces the form (a record gone, its data
 * failing to load) and leaves only Cancel.
 */
export function FormDialog({
  title,
  description,
  className,
  formId,
  submitLabel,
  submit,
  rootError,
  blocked,
  closeLabel,
  submitDisabled = false,
  children,
}: {
  /** The submit stays disabled, as while the options a field offers load or failed to (R-5). */
  readonly submitDisabled?: boolean;
  /** The close button's label when the form is replaced, such as Done after a result. */
  readonly closeLabel?: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly className?: string;
  readonly formId: string;
  readonly submitLabel: ReactNode;
  /** Validates and saves; resolves true to close, false to stay open (errors already shown). */
  readonly submit: () => Promise<boolean>;
  readonly rootError?: string;
  readonly blocked?: ReactNode;
  readonly children?: ReactNode;
}): ReactElement {
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const run = useCallback(async (): Promise<boolean> => {
    if (submittingRef.current) return false;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      return await submit();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [submit]);
  return (
    <RouteDialog
      title={title}
      description={description}
      className={className}
      beforeClose={() => !submittingRef.current}
      footer={
        <FormDialogFooter
          formId={formId}
          submitting={submitting}
          submitLabel={submitLabel}
          blocked={blocked !== undefined && blocked !== null}
          closeLabel={closeLabel}
          submitDisabled={submitDisabled}
        />
      }
    >
      <FormDialogBody formId={formId} run={run}>
        {blocked ?? (
          <>
            {rootError ? (
              <Alert variant='destructive'>
                <AlertCircleIcon />
                <AlertDescription>{rootError}</AlertDescription>
              </Alert>
            ) : null}
            <fieldset
              disabled={submitting}
              className='flex min-w-0 flex-col gap-5'
            >
              {children}
            </fieldset>
          </>
        )}
      </FormDialogBody>
    </RouteDialog>
  );
}

function FormDialogBody({
  formId,
  run,
  children,
}: {
  readonly formId: string;
  readonly run: () => Promise<boolean>;
  readonly children: ReactNode;
}): ReactElement {
  const { close } = useRouteOverlay();
  return (
    <form
      id={formId}
      noValidate
      className='flex flex-col gap-4'
      onSubmit={(event) => {
        event.preventDefault();
        void run().then((done) => {
          if (done) void close();
        });
      }}
    >
      {children}
    </form>
  );
}

function FormDialogFooter({
  formId,
  submitting,
  submitLabel,
  blocked,
  closeLabel,
  submitDisabled,
}: {
  readonly formId: string;
  readonly submitting: boolean;
  readonly submitLabel: ReactNode;
  readonly blocked: boolean;
  readonly closeLabel?: ReactNode;
  readonly submitDisabled: boolean;
}): ReactElement {
  const { text } = useAdminText();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {blocked && closeLabel ? closeLabel : text('common.cancel')}
      </Button>
      {blocked ? null : (
        <Button
          type='submit'
          form={formId}
          disabled={submitting || submitDisabled}
        >
          {submitting ? <Spinner data-icon='inline-start' /> : null}
          {submitLabel}
        </Button>
      )}
    </>
  );
}

/** A labelled text input with its hint and error (guidelines T3.2, T3.3); its id is `${formId}-${name}`. */
export function TextField({
  formId,
  name,
  label,
  value,
  onChange,
  error,
  hint,
  required = false,
  type = 'text',
  autoComplete = 'off',
  maxLength,
}: {
  readonly formId: string;
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string;
  readonly hint?: string;
  readonly required?: boolean;
  readonly type?: 'text' | 'email' | 'password';
  readonly autoComplete?: string;
  readonly maxLength?: number;
}): ReactElement {
  const id = `${formId}-${name}`;
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden='true' className='text-destructive'>
            *
          </span>
        ) : null}
      </FieldLabel>
      <Input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        maxLength={maxLength}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && !error ? <FieldDescription>{hint}</FieldDescription> : null}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

/**
 * A page's tabs as links (each tab is a child route): underlined on a thin rule, the open one in the foreground over a
 * 2px line, as a record's own tabs are drawn.
 */
export function RouteTabs({
  tabs,
  label,
  replace = false,
  onNavigate,
}: {
  readonly tabs: readonly {
    readonly to: To;
    readonly label: string;
    readonly active: boolean;
    readonly count?: number;
    /** A dot after the label, read as this text: the tab holds unsaved changes. */
    readonly marked?: string;
  }[];
  readonly label: string;
  /** Switching tabs replaces the history entry, as a drawer's tabs do. */
  readonly replace?: boolean;
  /** Called as a tab is clicked, before it navigates. */
  readonly onNavigate?: () => void;
}): ReactElement {
  return (
    <nav
      aria-label={label}
      className='flex w-full flex-wrap gap-x-5 border-b border-border'
    >
      {tabs.map((tab) => (
        <Link
          key={tab.label}
          to={tab.to}
          replace={replace}
          onClick={(event) => {
            // Only a plain click navigates here; a modified one opens a tab.
            if (
              event.button === 0 &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.shiftKey &&
              !event.altKey
            )
              onNavigate?.();
          }}
          aria-current={tab.active ? 'page' : undefined}
          className={`-mb-px flex h-10 items-center gap-1.5 border-b-2 text-sm font-medium transition-colors outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset ${
            tab.active
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.label}
          {tab.marked ? (
            <span className='size-1.5 rounded-full bg-primary'>
              <span className='sr-only'>{tab.marked}</span>
            </span>
          ) : null}
          {tab.count !== undefined ? (
            <span className='text-muted-foreground tabular-nums'>
              {tab.count}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

/** Label–value skeletons for a dialog whose record is loading (guideline S1). */
export function FieldsSkeleton({
  rows = 3,
}: {
  readonly rows?: number;
}): ReactElement {
  const { text } = useAdminText();
  return (
    <div
      role='status'
      aria-label={text('common.loading')}
      className='flex flex-col gap-4'
    >
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className='flex flex-col gap-2'>
          <Skeleton className='h-4 w-20' />
          <Skeleton className='h-9 w-full' />
        </div>
      ))}
    </div>
  );
}
