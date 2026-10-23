/**
 * A button that reads as words among others — 预留, 更换, 不需要, 暂不处理 —
 * underlined on hover like a text link, without the ghost button's ground
 * or its change of colour (2026-10-23). Its padding is taken back by the
 * caller (`-mx-2.5`), so its words sit the row's gap from their neighbours.
 * A muted one says `hover:text-muted-foreground` as well.
 */
export const TEXT_BUTTON =
  'underline-offset-4 hover:bg-transparent hover:underline aria-expanded:bg-transparent dark:hover:bg-transparent';
