import {
  isAssetTypeField,
  isEntitlementKindField,
  isAuditStatusField,
  isDisposalStatusField,
  isPurchaseOrderStatusField,
} from '@/lib/itam/fields';
import { AssetTypeBadge } from './asset-type-badge.js';
import { CollapsibleText } from './collapsible-text.js';
import {
  EntitlementKindBadge,
  AuditStatusBadge,
  DisposalStatusBadge,
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
      if (!plainEnums) return <EnumBadge field={field} value={value} />;
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
      // The text stays plain so a double-click still edits in place; the
      // icon after it opens the address in a new tab.
      const href = text(value);
      return (
        <span className='inline-flex max-w-full items-baseline gap-1'>
          <span className='min-w-0 break-all'>{href}</span>
          <a
            href={/^https?:\/\//i.test(href) ? href : `https://${href}`}
            target='_blank'
            rel='noreferrer'
            aria-label={href}
            className='shrink-0 self-center text-muted-foreground hover:text-link'
            onClick={(event) => event.stopPropagation()}
          >
            <ExternalLink className='size-3.5' aria-hidden='true' />
          </a>
        </span>
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
