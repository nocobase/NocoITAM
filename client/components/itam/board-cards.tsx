import { useTranslation } from '@nocobase/i18n/client';
import type { LucideIcon } from 'lucide-react';
import { Fragment, type ReactElement, type ReactNode } from 'react';

import { FieldValue } from '@/components/itam/cells';
import { DocumentTypeBadge } from '@/components/itam/document-type-badge';
import { useItamSettings, type ItamRecord } from '@/lib/itam/api';
import type { DocumentKind } from '@/lib/itam/document-kinds';
import type { FieldDefinition } from '@/lib/itam/fields';
import { text } from '@/lib/itam/format';
import { useReferenceNames } from '@/lib/itam/references';
import { cn } from '@/lib/utils';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * One piece of a card: a field key, shown as its value alone (the card has
 * no labels), or a function for a value made of several fields.
 */
export type CardPart =
  string | ((record: ItamRecord, t: Translate) => ReactNode | null | undefined);

/**
 * A line under a card's heading: a part, or a part with the icon that says
 * what it is (an amount, a vendor) where the value alone would not.
 */
export type CardLine =
  CardPart | { readonly part: CardPart; readonly icon: LucideIcon };

/**
 * How a record reads as a card: its heading, figure, lines and footer. One
 * spec draws the card wherever the record shows as one — its own status
 * board, and a workbench column listing the same records.
 */
export interface BoardCardSpec {
  readonly fields: readonly FieldDefinition[];
  /** The field a card is headed by (its number or name). */
  readonly nameField: string;
  /**
   * The document kind a card is tagged with before its heading, on its
   * board and on the workbench alike.
   */
  readonly kind?: DocumentKind;
  readonly card: {
    /** Beside the heading, right-aligned: an amount, a progress. */
    readonly meta?: CardPart;
    /** Under the heading, one line each: what the record is about. */
    readonly lines?: readonly CardLine[];
    /** Small and muted at the bottom: who and when. */
    readonly footer?: readonly CardPart[];
  };
}

const blank = (value: unknown): boolean =>
  value === null || value === undefined || value === '';

/** One card: a record and the spec it is drawn by. */
export interface BoardCardEntry {
  readonly spec: BoardCardSpec;
  readonly row: ItamRecord;
  /**
   * Before the heading, for a record that is not a document and so has no
   * `kind` to be tagged by (an overdue loan's device).
   */
  readonly badge?: ReactNode;
  /**
   * At the right of the bottom line: what this card is to the reader where
   * the list is everybody's (待你审批 on the workbench's team view).
   */
  readonly marker?: ReactNode;
}

/** A line's part, whether or not it carries an icon. */
const partOf = (line: CardLine): CardPart =>
  typeof line === 'object' ? line.part : line;

const partsOf = (spec: BoardCardSpec): readonly (CardPart | undefined)[] => [
  spec.card.meta,
  ...(spec.card.lines ?? []).map(partOf),
  ...(spec.card.footer ?? []),
];

/**
 * Records drawn as board cards, each by its own spec — one kind on a status
 * board, several on a workbench column that merges them (待审批 holds
 * purchase orders and disposals). The reference names they show are looked
 * up once per collection for the whole list, and a card opens its record
 * through `onOpen`.
 */
export function BoardCards({
  entries,
  onOpen,
}: {
  readonly entries: readonly BoardCardEntry[];
  readonly onOpen: (entry: BoardCardEntry) => void;
}): ReactElement {
  const { t } = useTranslation();
  const settings = useItamSettings();
  const fieldOf = (spec: BoardCardSpec, key: string) =>
    spec.fields.find((field) => field.key === key);
  const wanted = new Map<string, (string | null)[]>();
  for (const { spec, row } of entries)
    for (const part of partsOf(spec)) {
      const field = typeof part === 'string' ? fieldOf(spec, part) : undefined;
      if (field?.type !== 'reference' || !field.reference) continue;
      const ids = wanted.get(field.reference.collection) ?? [];
      ids.push(row[field.key] as string | null);
      wanted.set(field.reference.collection, ids);
    }
  const names = useReferenceNames(
    [...wanted].map(([collection, ids]) => ({ collection, ids })),
  );
  const render = (
    spec: BoardCardSpec,
    part: CardPart,
    row: ItamRecord,
  ): ReactNode => {
    if (typeof part === 'function') return part(row, t);
    const field = fieldOf(spec, part);
    if (!field || blank(row[part])) return null;
    return (
      <FieldValue
        field={field}
        value={row[part]}
        names={names}
        // Plain names: the whole card is the link.
        routeFor={() => ''}
        currency={text(row.currency) || settings.data?.general.currency}
        treeShow='leaf'
        plainEnums
      />
    );
  };
  return (
    <ul className='flex flex-col gap-2'>
      {entries.map((entry) => {
        const { spec, row } = entry;
        const meta = spec.card.meta && render(spec, spec.card.meta, row);
        const lines = (spec.card.lines ?? [])
          .map((line) => ({
            node: render(spec, partOf(line), row),
            Icon: typeof line === 'object' ? line.icon : undefined,
          }))
          .filter((line) => !blank(line.node));
        const footer = (spec.card.footer ?? [])
          .map((part) => render(spec, part, row))
          .filter((node) => !blank(node));
        return (
          <li key={`${spec.nameField}:${String(row.id)}`}>
            <button
              type='button'
              className='w-full rounded-xl border border-border/50 bg-card px-3.5 py-3 text-left shadow-xs transition hover:-translate-y-px hover:border-border hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
              onClick={() => {
                onOpen(entry);
              }}
            >
              <div className='flex items-center justify-between gap-2'>
                <span className='flex min-w-0 items-center gap-2'>
                  {spec.kind ? (
                    <DocumentTypeBadge kind={spec.kind} className='shrink-0' />
                  ) : null}
                  {entry.badge}
                  <span className='min-w-0 truncate text-sm font-semibold'>
                    {text(row[spec.nameField])}
                  </span>
                </span>
                {meta ? (
                  <span className='shrink-0 text-sm font-medium tabular-nums'>
                    {meta}
                  </span>
                ) : null}
              </div>
              {lines.length > 0 ? (
                <div className='mt-1.5 space-y-0.5 text-sm'>
                  {lines.map(({ node, Icon }, index) => (
                    <p
                      // Lines are positional: the config's order.
                      // eslint-disable-next-line @eslint-react/no-array-index-key -- see above
                      key={index}
                      // A line with an icon is a fact about the record (an
                      // amount, a vendor): a size down from what it is about.
                      className={cn(
                        'flex min-w-0 items-center gap-1.5',
                        Icon && 'text-xs',
                        index > 0 && 'text-muted-foreground',
                      )}
                    >
                      {Icon ? (
                        <Icon
                          aria-hidden='true'
                          className='size-3.5 shrink-0 text-muted-foreground'
                        />
                      ) : null}
                      <span className='min-w-0 truncate'>{node}</span>
                    </p>
                  ))}
                </div>
              ) : null}
              {footer.length > 0 || entry.marker ? (
                <p className='mt-2.5 flex min-w-0 items-center gap-1.5 border-t border-border/50 pt-2 text-xs text-muted-foreground'>
                  {/* Who comes first and is the one that gives way: a long
                      name is cut short, while the time and the marker after
                      it always read whole. */}
                  {footer.map((part, index) => (
                    // eslint-disable-next-line @eslint-react/no-array-index-key -- positional, as above
                    <Fragment key={index}>
                      {index > 0 ? (
                        <span aria-hidden='true' className='shrink-0'>
                          ·
                        </span>
                      ) : null}
                      <span
                        className={
                          index === 0 ? 'min-w-0 truncate' : 'shrink-0'
                        }
                      >
                        {part}
                      </span>
                    </Fragment>
                  ))}
                  {entry.marker ? (
                    <>
                      {footer.length > 0 ? (
                        <span aria-hidden='true' className='shrink-0'>
                          ·
                        </span>
                      ) : null}
                      <span className='shrink-0 font-medium text-foreground'>
                        {entry.marker}
                      </span>
                    </>
                  ) : null}
                </p>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
