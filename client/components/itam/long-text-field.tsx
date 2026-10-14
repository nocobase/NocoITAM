import { useTranslation } from '@nocobase/i18n/client';
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/itam/format';

/**
 * A long text in a record's information column (a description, notes), as
 * NocoCRM's record pages show one (2026-10-14): three lines that fade out
 * when there is more, opening on a click into a pop-up beside the column,
 * wide enough to read it whole and to edit it there — a double-click on the
 * text, as every field edits — so the column never jumps and editing has
 * room. It saves when the pop-up closes, Escape leaving it as it was, and
 * Cmd/Ctrl+Enter saves at once. An empty one the reader may fill opens
 * straight into the editor.
 */
export function LongTextField({
  value,
  label,
  editable,
  onSave,
}: {
  readonly value: string;
  readonly label: string;
  readonly editable: boolean;
  readonly onSave: (text: string | null) => Promise<void>;
}): ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const blank = !value.trim();
  const edit = (): void => {
    setDraft(value);
    setError(undefined);
    setEditing(true);
  };
  // Whether the text now stands as written (saved, or unchanged).
  const save = async (): Promise<boolean> => {
    if (draft === value) {
      setEditing(false);
      return true;
    }
    setSaving(true);
    setError(undefined);
    try {
      await onSave(draft.trim() ? draft : null);
      setEditing(false);
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    } finally {
      setSaving(false);
    }
  };
  if (blank && !editable)
    return <span className='text-muted-foreground'>—</span>;
  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        if (next) {
          setOpen(true);
          if (blank) edit();
          return;
        }
        // Escape leaves the text as it was; any other way out saves it,
        // staying open on the editor while it cannot be saved.
        if (!editing || details.reason === 'escape-key') {
          setEditing(false);
          setError(undefined);
          setOpen(false);
          return;
        }
        void save().then((saved) => {
          if (saved) setOpen(false);
        });
      }}
    >
      <PopoverTrigger
        nativeButton={false}
        aria-label={label}
        render={<div />}
        title={editable ? t('common.doubleClickToEdit') : undefined}
        className='-mx-1.5 -my-0.5 block cursor-pointer rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'
      >
        {blank ? (
          <span className='text-muted-foreground'>—</span>
        ) : (
          <FadePreview>{value}</FadePreview>
        )}
      </PopoverTrigger>
      {/* Beside the column, toward the page's middle; a very long text
          scrolls inside. */}
      <PopoverContent
        side='right'
        align='start'
        sideOffset={8}
        // An empty one opens on its editor, which takes the keys.
        initialFocus={blank ? editorRef : true}
        className='max-h-[min(36rem,70vh)] w-[28rem] max-w-[calc(100vw-2rem)] gap-2 overflow-y-auto p-4'
      >
        <span className='truncate text-xs font-medium text-muted-foreground'>
          {label}
        </span>
        {editing ? (
          <>
            <Textarea
              ref={editorRef}
              aria-label={label}
              autoFocus
              rows={10}
              value={draft}
              disabled={saving}
              className='max-h-[50vh] text-sm leading-relaxed'
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void save().then((saved) => {
                    if (saved) setOpen(false);
                  });
                }
              }}
            />
            {error ? (
              <span className='text-xs text-destructive'>{error}</span>
            ) : null}
          </>
        ) : (
          // A double-click edits it too, as it does every other field.
          <div
            className={`text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere ${
              editable ? 'cursor-text' : ''
            }`}
            onDoubleClick={() => {
              if (!editable) return;
              // The double-click also selected the word under it.
              window.getSelection()?.removeAllRanges();
              edit();
            }}
          >
            {value}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Three lines of a long text, the last fading out while there is more. */
function FadePreview({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = (): void =>
      setOverflows(element.scrollHeight > element.clientHeight + 1);
    // The observer reports once when it starts, then on every resize.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children]);
  return (
    <div
      ref={ref}
      className={`line-clamp-3 leading-relaxed whitespace-pre-wrap wrap-anywhere ${
        overflows
          ? '[mask-image:linear-gradient(to_bottom,black_55%,transparent)]'
          : ''
      }`}
    >
      {children}
    </div>
  );
}
