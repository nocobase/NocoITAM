import { useTranslation } from '@nocobase/i18n/client';
import { CircleCheck, Plug, Unplug } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useDeviceConnectionActions,
  type DeviceConnection,
  type DeviceConnectionInput,
  type DeviceSourceKey,
} from '@/lib/itam/device-sync';
import { formatDate } from '@/lib/itam/format';
import { useReferenceNames } from '@/lib/itam/references';

/**
 * A platform's connection on 设置 → MDM (2026-10-15): entered here
 * with the secret sealed on the server, or set in `config.yml`, which wins
 * and is shown read-only. The secret is written, never read back.
 *
 * Two parts: the buttons, beside the platform's name and status, and the
 * notes about the connection, beneath them.
 */
export function DeviceConnectionActions({
  source,
  connection,
  secretsReady,
}: {
  readonly source: DeviceSourceKey;
  readonly connection: DeviceConnection | undefined;
  readonly secretsReady: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const { remove } = useDeviceConnectionActions();
  const name = t(`deviceSync.sourceNames.${source}`);
  // `config.yml`'s connection is changed on the server, not here.
  if (connection?.origin === 'config') return null;
  const stored = connection?.origin === 'settings';
  return (
    <>
      <Button
        variant='outline'
        disabled={!secretsReady}
        onClick={() => setEditing(true)}
      >
        <Plug data-icon='inline-start' />
        {t(
          stored
            ? 'settings.deviceSync.connection.edit'
            : 'settings.deviceSync.connection.connect',
        )}
      </Button>
      {stored ? (
        <Button
          variant='outline'
          className='text-destructive hover:text-destructive'
          onClick={() => setDisconnecting(true)}
        >
          <Unplug data-icon='inline-start' />
          {t('settings.deviceSync.connection.disconnect')}
        </Button>
      ) : null}
      {editing ? (
        <ConnectionDialog
          source={source}
          connection={connection}
          onClose={() => setEditing(false)}
        />
      ) : null}
      <ConfirmDialog
        open={disconnecting}
        onOpenChange={(open) => {
          setDisconnecting(open);
          if (!open) remove.reset();
        }}
        title={t('settings.deviceSync.connection.disconnectTitle', { name })}
        description={t('settings.deviceSync.connection.disconnectDescription')}
        busy={remove.isPending}
        error={remove.error}
        destructive
        confirmLabel={t('settings.deviceSync.connection.disconnect')}
        onConfirm={() =>
          remove.mutate(source, { onSuccess: () => setDisconnecting(false) })
        }
      />
    </>
  );
}

/** Where the connection comes from, who saved it, or why none can be. */
export function DeviceConnectionNotes({
  connection,
  secretsReady,
}: {
  readonly connection: DeviceConnection | undefined;
  readonly secretsReady: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  const people = useReferenceNames([
    {
      collection: 'users',
      ids: connection?.updatedById ? [connection.updatedById] : [],
    },
  ]);
  if (connection?.origin === 'config')
    return (
      <p className='text-sm text-muted-foreground'>
        {t('settings.deviceSync.connection.fromConfig')}
      </p>
    );
  if (connection?.origin === 'demo')
    return (
      <p className='text-sm text-muted-foreground'>
        {t('settings.deviceSync.connection.demo', {
          name: t(`deviceSync.sourceNames.${connection.source}`),
        })}
      </p>
    );
  if (connection?.origin === 'settings')
    return (
      <p className='text-sm text-muted-foreground'>
        {t('settings.deviceSync.connection.saved', {
          clientId: connection.clientId,
          name: people.users?.get(connection.updatedById ?? '') ?? '…',
          date: formatDate(connection.updatedAt, true),
        })}
      </p>
    );
  return secretsReady ? null : (
    <p className='text-sm text-destructive'>
      {t('settings.deviceSync.connection.secretsMissing')}
    </p>
  );
}

function ConnectionDialog({
  source,
  connection,
  onClose,
}: {
  readonly source: DeviceSourceKey;
  readonly connection: DeviceConnection | undefined;
  readonly onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const { save, test } = useDeviceConnectionActions();
  const stored = connection?.origin === 'settings';
  const [values, setValues] = useState({
    tenantId: connection?.tenantId ?? '',
    url: connection?.url ?? '',
    clientId: connection?.clientId ?? '',
    clientSecret: '',
  });
  const name = t(`deviceSync.sourceNames.${source}`);
  const input: DeviceConnectionInput = {
    ...(source === 'intune'
      ? { tenantId: values.tenantId }
      : { url: values.url }),
    clientId: values.clientId,
    // Empty keeps the stored secret.
    ...(values.clientSecret ? { clientSecret: values.clientSecret } : {}),
  };
  const set = (field: keyof typeof values) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    test.reset();
  };
  const fields: readonly {
    key: keyof typeof values;
    secret?: boolean;
    placeholder?: string;
  }[] = [
    source === 'intune'
      ? { key: 'tenantId' }
      : {
          key: 'url',
          placeholder: t('settings.deviceSync.connection.urlPlaceholder'),
        },
    { key: 'clientId' },
    {
      key: 'clientSecret',
      secret: true,
      placeholder: stored
        ? t('settings.deviceSync.connection.secretKept')
        : undefined,
    },
  ];
  const result = test.data;
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t(
        stored
          ? 'settings.deviceSync.connection.editTitle'
          : 'settings.deviceSync.connection.title',
        { name },
      )}
      description={t('settings.deviceSync.connection.description')}
      busy={save.isPending || test.isPending}
      error={save.error ?? test.error}
      confirmLabel={t('settings.deviceSync.connection.save')}
      onConfirm={() =>
        save.mutate({ source, values: input }, { onSuccess: onClose })
      }
      secondaryLabel={t('settings.deviceSync.connection.test')}
      onSecondary={() => test.mutate({ source, values: input })}
    >
      {fields.map((field) => (
        <div key={field.key} className='grid gap-1.5'>
          <Label htmlFor={`device-connection-${field.key}`}>
            {t(`settings.deviceSync.connection.fields.${field.key}`)}
          </Label>
          <Input
            id={`device-connection-${field.key}`}
            type={field.secret ? 'password' : 'text'}
            autoComplete={field.secret ? 'new-password' : 'off'}
            placeholder={field.placeholder}
            value={values[field.key]}
            onChange={(event) => set(field.key)(event.target.value)}
          />
        </div>
      ))}
      {result ? (
        result.ok ? (
          <p className='flex items-center gap-1.5 text-sm'>
            <CircleCheck aria-hidden='true' className='size-4 text-success' />
            {t('settings.deviceSync.connection.testOk', {
              count: result.devices,
            })}
          </p>
        ) : (
          <p className='text-sm text-destructive'>
            {/* A nightly run's "tried again tonight" says nothing to a
                person testing now. */}
            {result.failureCode === 'UNAVAILABLE'
              ? t('settings.deviceSync.connection.unreachable')
              : t(`settings.deviceSync.failures.${result.failureCode}`, {
                  defaultValue: result.failureCode,
                })}
            {result.failure ? (
              <span className='text-muted-foreground'> ({result.failure})</span>
            ) : null}
          </p>
        )
      ) : null}
    </ConfirmDialog>
  );
}
