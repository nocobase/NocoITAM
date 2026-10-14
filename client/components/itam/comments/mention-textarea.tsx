import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type ReactElement,
} from 'react';
import { Textarea } from '@/components/ui/textarea';

import type { Colleague } from './colleagues.js';

// Ported from NocoCRM (client/components/crm/mention-textarea.tsx), with the
// colleagues passed in rather than read from the CRM's metadata.
// A comment's box that @-mentions colleagues: typing @ and the start of a name
// lists the matching colleagues under the box (arrows and Enter or Tab to
// pick, Escape to close, or a click), and a pick writes "@Name " and
// remembers who it is. The ids reach the comment only while their "@Name" is
// still in the text (mentionsIn in mentions.tsx).

// The "@" and what follows it right before the caret, while it is still
// being typed: anywhere but right after a character an email address is
// made of ("name@company.com" is not a mention), so after Chinese text, a
// space or the start alike; up to twenty characters with no space.
function typing(
  text: string,
  caret: number,
): { at: number; query: string } | undefined {
  const match = /(^|[^A-Za-z0-9._%+-])@([^\s@]{0,20})$/.exec(
    text.slice(0, caret),
  );
  return match
    ? { at: caret - match[2].length - 1, query: match[2] }
    : undefined;
}

// The box's text with each mentioned "@Name" drawn as a saved comment draws
// it (MENTION_CLASS): in the mention's colour, made bold by a stroke.
function marked(text: string, names: readonly string[]): ReactNode[] {
  if (!names.length) return [text];
  const pattern = new RegExp(
    `(${[...names]
      .sort((a, b) => b.length - a.length)
      .map((n) => `@${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      .join('|')})`,
  );
  let offset = 0;
  return text.split(pattern).map((part, index) => {
    const start = offset;
    offset += part.length;
    return index % 2 ? (
      <span
        key={`m${String(start)}`}
        // Bold by a stroke rather than the weight, which would widen the
        // name and move the text off the box's caret.
        className='text-primary [-webkit-text-stroke:0.35px_currentColor]'
      >
        {part}
      </span>
    ) : (
      part
    );
  });
}

export function MentionTextarea({
  value,
  onChange,
  mentions,
  onMentionsChange,
  colleagues,
  onKeyDown,
  ...props
}: Omit<ComponentProps<typeof Textarea>, 'value' | 'onChange'> & {
  value: string;
  onChange: (text: string) => void;
  mentions: readonly string[];
  onMentionsChange: (mentions: string[]) => void;
  /** Who may be mentioned: IT's accounts, other than the writer. */
  colleagues: readonly Colleague[];
}): ReactElement {
  const ref = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<number | undefined>(undefined);
  // The layer under the box that draws its text, each mentioned "@Name" in
  // the mention's colour: it copies the box's box model and type, so its
  // text lies exactly under the box's own, which is transparent but for
  // its caret. It carries the fill, the card's white: the box is
  // transparent, so its own fill cannot be read from it.
  const backRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ref.current;
    const back = backRef.current;
    if (!box || !back) return;
    const copy = (): void => {
      const style = getComputedStyle(box);
      Object.assign(back.style, {
        padding: style.padding,
        borderWidth: style.borderWidth,
        borderStyle: 'solid',
        borderColor: 'transparent',
        borderRadius: style.borderRadius,
        font: style.font,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
      } satisfies CSSProperties);
    };
    copy();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(copy);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  const names = mentions
    .map((id) => colleagues.find((u) => u.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const [open, setOpen] = useState<{ at: number; query: string }>();
  const [active, setActive] = useState(0);
  const matches = open
    ? colleagues
        .filter((u) => u.name.toLowerCase().includes(open.query.toLowerCase()))
        .slice(0, 8)
    : [];
  const look = (text: string, caret: number | null): void => {
    const next = caret == null ? undefined : typing(text, caret);
    setOpen(next);
    if (next?.query !== open?.query) setActive(0);
  };
  const pick = (user: { id: string; name: string }): void => {
    if (!open) return;
    const caret = ref.current?.selectionStart ?? value.length;
    const inserted = `@${user.name} `;
    const text = value.slice(0, open.at) + inserted + value.slice(caret);
    onChange(text);
    if (!mentions.includes(user.id)) onMentionsChange([...mentions, user.id]);
    setOpen(undefined);
    caretRef.current = open.at + inserted.length;
  };
  // After a pick, the caret goes right after the name as soon as the box
  // holds the new text, before anything else is typed.
  useLayoutEffect(() => {
    const caret = caretRef.current;
    if (caret == null || !ref.current) return;
    caretRef.current = undefined;
    ref.current.focus();
    ref.current.setSelectionRange(caret, caret);
  }, [value]);
  const keys = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (open && matches.length) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((active + step + matches.length) % matches.length);
        return;
      }
      if (
        (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) ||
        event.key === 'Tab'
      ) {
        event.preventDefault();
        pick(matches[active] ?? matches[0]);
        return;
      }
    }
    if (open && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(undefined);
      return;
    }
    onKeyDown?.(event);
  };
  return (
    <div className='relative min-w-0 flex-1'>
      <div
        ref={backRef}
        aria-hidden
        className='pointer-events-none absolute inset-0 overflow-hidden bg-card break-words whitespace-pre-wrap text-foreground'
      >
        {marked(value, names)}
        {/* A last line break still takes a line, as in the box. */}
        {'\u200b'}
      </div>
      <Textarea
        {...props}
        ref={ref}
        value={value}
        // Its fill and its text are the layer's, under it; only the caret
        // is its own.
        style={{
          ...props.style,
          background: 'transparent',
          color: 'transparent',
          caretColor: 'var(--foreground)',
          position: 'relative',
        }}
        onScroll={(event) => {
          if (backRef.current)
            backRef.current.scrollTop = event.currentTarget.scrollTop;
        }}
        onChange={(event) => {
          onChange(event.target.value);
          look(event.target.value, event.target.selectionStart);
        }}
        onKeyDown={keys}
        onClick={(event) =>
          look(event.currentTarget.value, event.currentTarget.selectionStart)
        }
        onBlur={() => setOpen(undefined)}
        aria-autocomplete='list'
        aria-expanded={Boolean(open && matches.length)}
      />
      {open && matches.length ? (
        <ul
          role='listbox'
          className='absolute top-full left-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md'
        >
          {matches.map((user, index) => (
            <li
              key={user.id}
              role='option'
              aria-selected={index === active}
              className={`cursor-pointer truncate rounded-md px-2 py-1.5 ${
                index === active ? 'bg-muted' : ''
              }`}
              // Before the box's blur closes the list.
              onMouseDown={(event) => {
                event.preventDefault();
                pick(user);
              }}
              onMouseEnter={() => setActive(index)}
            >
              {user.name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
