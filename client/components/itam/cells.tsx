import {
  isAssetTypeField,
  isEntitlementKindField,
  isAuditStatusField,
  isDisposalStatusField,
  isEmploymentStatusField,
  isPurchaseOrderStatusField,
} from '@/lib/itam/fields';
import { AssetTypeBadge } from './asset-type-badge.js';
import { CollapsibleText } from './collapsible-text.js';
import {
  EntitlementKindBadge,
  AuditStatusBadge,
  DisposalStatusBadge,
  EmploymentStatusBadge,
  PurchaseOrderStatusBadge,
} from './status-badge.js';
import { useTranslation } from '@nocobase/i18n/client';
import { ExternalLink } from 'lucide-react';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import type { FieldDefinition } from '@/lib/itam/fields';
import { formatDate, formatMoney, text } from '@/lib/itam/format';
import { referenceRoute, type ReferenceNames } from '@/lib/itam/references';
import { isTreeReference } from '@/lib/itam/tree';

import { RecordLink } from './record-link.js';
import { TreePath } from './tree-path.js';
import { UserAccount } from './user-account.js';

export function EnumBadge({
  field,
  value,
}: {
  readonly field: FieldDefinition;
  readonly value: unknown;
}): ReactElement | null {
  const { t } = useTranslation();
  if (value === null || value === undefined || value === '') return null;
  if (isAssetTypeField(field)) return <AssetTypeBadge value={value} />;
  if (isEntitlementKindField(field))
    return <EntitlementKindBadge kind={value} />;
  if (isPurchaseOrderStatusField(field))
    return <PurchaseOrderStatusBadge status={value} />;
  if (isDisposalStatusField(field))
    return <DisposalStatusBadge status={value} />;
  if (isAuditStatusField(field)) return <AuditStatusBadge status={value} />;
  if (isEmploymentStatusField(field))
    return <EmploymentStatusBadge status={value} />;
  const values = Array.isArray(value) ? value : [value];
  return (
    <span className='flex flex-wrap gap-1'>
      {values.map((entry) => {
        const option = field.options?.find(
          (candidate) => candidate.value === text(entry),
        );
        return (
          <Badge key={text(entry)} variant='outline'>
            {option ? t(option.label) : text(entry)}
          </Badge>
        );
      })}
    </span>
  );
}

export interface ReferenceLinkProps {
  readonly collection: string;
  readonly route: string;
  readonly id: unknown;
  readonly names: ReferenceNames | undefined;
}

export function ReferenceLink({
  collection,
  route,
  id,
  names,
}: ReferenceLinkProps): ReactElement | null {
  const { t } = useTranslation();
  if (!id) return null;
  const key = text(id);
  const name = names?.get(key);
  // Names arrive as a map once loaded; a key missing from a loaded map is a
  // record that no longer exists.
  if (names && name === undefined)
    return (
      <span className='text-muted-foreground' data-collection={collection}>
        {t('common.missingRecord')}
      </span>
    );
  if (!route) return <span data-collection={collection}>{name ?? key}</span>;
  return (
    <RecordLink
      className='text-link underline-offset-4 hover:underline'
      to={`/${route}/${key}`}
      data-collection={collection}
    >
      {name ?? '…'}
    </RecordLink>
  );
}

/** Renders a value according to its field definition. */
export function FieldValue({
  field,
  value,
  names,
  routeFor,
  currency,
  plainEnums,
  treeShow = 'path',
}: {
  readonly field: FieldDefinition;
  readonly value: unknown;
  readonly names?: Record<string, ReferenceNames>;
  readonly routeFor?: (collection: string) => string;
  /** Render enum values as plain text rather than badges (detail columns). */
  readonly plainEnums?: boolean;
  readonly currency?: string | null;
  /** How a tree node reads: with its ancestors (detail) or just itself (a list column). */
  readonly treeShow?: 'path' | 'leaf' | 'root';
}): ReactElement | null {
  const { t } = useTranslation();
  if (value === null || value === undefined || value === '') {
    return <span className='text-muted-foreground'>—</span>;
  }
  switch (field.type) {
    case 'boolean':
      return <span>{value ? t('common.yes') : t('common.no')}</span>;
    case 'date':
      return (
        <span className='tabular-nums'>
          {formatDate(value, field.key.endsWith('At'))}
        </span>
      );
    case 'money':
      return (
        <span className='tabular-nums'>{formatMoney(value, currency)}</span>
      );
    case 'select':
    case 'multiselect': {
      if (isAssetTypeField(field)) return <AssetTypeBadge value={value} />;
      if (isEntitlementKindField(field))
        return <EntitlementKindBadge kind={value} />;
      if (isPurchaseOrderStatusField(field) && !plainEnums)
        return <PurchaseOrderStatusBadge status={value} />;
      if (isDisposalStatusField(field) && !plainEnums)
        return <DisposalStatusBadge status={value} />;
      if (isAuditStatusField(field) && !plainEnums)
        return <AuditStatusBadge status={value} />;
      // A person's state is a tag wherever it shows (2026-10-21), the
      // people list's plain cells included, as an asset type is.
      if (isEmploymentStatusField(field))
        return <EmploymentStatusBadge status={value} />;
      // Several choices read as a tag each, even where one choice is plain
      // text (2026-10-21): a vendor's 设备供应商 and 软件经销商 rather than a
      // comma-separated line.
      if (!plainEnums || field.type === 'multiselect')
        return <EnumBadge field={field} value={value} />;
      const values = Array.isArray(value) ? value : [value];
      return (
        <>
          {values
            .map((entry) => {
              const option = field.options?.find(
                (candidate) => candidate.value === text(entry),
              );
              return option ? t(option.label) : text(entry);
            })
            .join(', ')}
        </>
      );
    }
    case 'reference': {
      const collection = field.reference?.collection ?? '';
      // A node of a tree (category, location, department) reads with its
      // ancestors unless the caller asks for the node alone.
      if (isTreeReference(field) && value)
        return (
          <TreePath collection={collection} nodeId={value} show={treeShow} />
        );
      // A sign-in reads as one: its username and whether it is enabled.
      if (field.reference?.account && value)
        return <UserAccount id={text(value)} />;
      return (
        <ReferenceLink
          collection={collection}
          route={routeFor?.(collection) ?? referenceRoute(collection)}
          id={value}
          names={names?.[collection]}
        />
      );
    }
    case 'percent':
      return (
        <span className='tabular-nums'>
          {Math.round(Number(value) * 10000) / 100}%
        </span>
      );
    case 'number':
      return <span className='tabular-nums'>{text(value)}</span>;
    case 'url': {
      // An address out of the application (2026-10-21; plain text with an
      // icon until then): underlined in the text's own colour with the
      // external icon, never the green of a link that opens a record here;
      // without its scheme and www, the whole of it on hover, in a new tab.
      // Editing in place goes through the row's edit button.
      const raw = text(value);
      const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      const shown = raw
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .replace(/\/$/, '');
      return (
        <a
          href={href}
          target='_blank'
          rel='noreferrer'
          title={raw}
          className='inline-flex max-w-full items-baseline gap-1 underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-foreground'
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <span className='min-w-0 break-all'>{shown}</span>
          <ExternalLink
            className='size-3.5 shrink-0 self-center text-muted-foreground'
            aria-hidden='true'
          />
        </a>
      );
    }
    case 'textarea':
      // Multi-line text keeps its line breaks and folds when long.
      return <CollapsibleText text={text(value)} />;
    default:
      // Any remaining value is text someone typed, and a plain string field
      // can still hold a paragraph, so it folds by the same rule rather than
      // pushing everything below it down the page.
      return <CollapsibleText text={text(value)} />;
  }
}
