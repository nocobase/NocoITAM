import { useCallback, useRef, type PointerEvent } from 'react';

// A board moved sideways by holding its empty space and dragging, as
// Trello's and NocoCRM's are (2026-10-14): a press on the board, outside a
// card and outside anything that may be clicked or typed in, pans it until
// the button is let go. A column's own scrolling, up and down, is untouched,
// and a touch screen keeps its native swipe.
const SKIP =
  'a, button, input, textarea, select, label, [role="button"], [draggable="true"], [contenteditable="true"]';

export interface DragPan {
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
}

/** Spread on the scrolling element; style it with `data-[panning]:…`. */
export function useDragPan(): DragPan {
  const panRef = useRef<{ x: number; left: number } | null>(null);
  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || event.pointerType === 'touch') return;
    if ((event.target as Element).closest(SKIP)) return;
    const board = event.currentTarget;
    panRef.current = { x: event.clientX, left: board.scrollLeft };
    board.setPointerCapture(event.pointerId);
    board.dataset.panning = '';
    // No text is selected while the board moves.
    event.preventDefault();
  }, []);
  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    if (!panRef.current) return;
    event.currentTarget.scrollLeft =
      panRef.current.left - (event.clientX - panRef.current.x);
  }, []);
  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    if (!panRef.current) return;
    panRef.current = null;
    const board = event.currentTarget;
    if (board.hasPointerCapture(event.pointerId))
      board.releasePointerCapture(event.pointerId);
    delete board.dataset.panning;
  }, []);
  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };
}
