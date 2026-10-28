import { createContext } from 'react';

/**
 * Where a value with controls of its own puts them (2026-10-28): among the
 * icons that float at the field's end on hover — a product key's 显示 and
 * 复制 — rather than beside the value. `null` outside a field.
 */
export const FieldActionsSlotContext = createContext<HTMLElement | null>(null);

/** One floating icon's look, for the controls a value puts in the slot. */
export const FIELD_ACTION_ICON =
  'inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';
