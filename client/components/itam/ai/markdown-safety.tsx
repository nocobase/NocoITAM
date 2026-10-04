import type { Components } from 'react-markdown';

import { cn } from '../../../lib/utils.js';

/**
 * The assistant renders Markdown the model wrote, and that is not trusted
 * input. Everything a person typed into the register reaches the conversation
 * — a device's notes, a vendor's name, a repair's description, an imported row
 * — so an instruction planted in one of those fields can ask the model to end
 * its answer with an image whose URL carries what it just read. Rendering that
 * `<img>` is what sends the data: the browser fetches it before anybody has
 * looked at the reply.
 *
 * So an image is never loaded. Its target is shown as a link instead, which
 * keeps the information on screen without fetching anything, and a link's own
 * target is narrowed to the protocols that need a click — react-markdown's
 * default rejects only dangerous protocols such as `javascript:`, never an
 * external host.
 *
 * The server's Content-Security-Policy is the second line of this, because
 * these two are used from `client/extensions/nocobase-ai`, the Registry copy,
 * where a future three-way merge could take upstream's file and drop them.
 */

/** Protocols a reader reaches by clicking, rather than by loading the page. */
const CLICKABLE = new Set(['http:', 'https:', 'mailto:']);

/**
 * The URL react-markdown may put in an attribute, or an empty string when it
 * is not one a reader should be sent to.
 */
export function safeMarkdownUrl(url: string): string {
  const value = url.trim();
  if (value === '') return '';
  // Relative targets resolve against this application, so they reach nothing
  // else; `new URL` needs a base for them and a document is not always there.
  if (/^[./#?]/.test(value)) return value;
  const base =
    typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  try {
    return CLICKABLE.has(new URL(value, base).protocol) ? value : '';
  } catch {
    return '';
  }
}

/** An image in the model's Markdown, rendered as a link and never fetched. */
export const markdownImage: Components['img'] = ({
  src,
  alt,
  title,
  className,
}) => {
  const target = typeof src === 'string' ? safeMarkdownUrl(src) : '';
  const label =
    (typeof alt === 'string' && alt.trim()) || title?.trim() || target;
  if (!target) return <span className={className}>{label}</span>;
  return (
    <a
      href={target}
      target='_blank'
      rel='noreferrer noopener'
      className={cn('underline underline-offset-4', className)}
    >
      {label}
    </a>
  );
};
