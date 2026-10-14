import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, expect, it } from 'vitest';

import { useDragPan } from '../../client/hooks/use-drag-pan.js';

beforeAll(() => {
  // jsdom has no pointer capture.
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.hasPointerCapture = () => true;
});

function Board() {
  const pan = useDragPan();
  return (
    <div data-testid='board' {...pan}>
      <p data-testid='empty'>column</p>
      <button type='button'>card</button>
    </div>
  );
}

function press(target: Element, type: string, clientX: number) {
  fireEvent(
    target,
    new MouseEvent(type, { bubbles: true, button: 0, clientX }) as Event,
  );
}

// jsdom's PointerEvent lacks pointerType and pointerId, so MouseEvents named
// as pointer events carry the same fields React reads.
it('pans the board when its empty space is dragged', () => {
  render(<Board />);
  const board = screen.getByTestId('board');
  board.scrollLeft = 100;
  press(screen.getByTestId('empty'), 'pointerdown', 300);
  expect(board.dataset.panning).toBe('');
  press(board, 'pointermove', 220);
  expect(board.scrollLeft).toBe(180);
  press(board, 'pointerup', 220);
  expect(board.dataset.panning).toBeUndefined();
  press(board, 'pointermove', 100);
  expect(board.scrollLeft).toBe(180);
});

it('leaves a press on a card to the card', () => {
  render(<Board />);
  const board = screen.getByTestId('board');
  board.scrollLeft = 100;
  press(screen.getByRole('button'), 'pointerdown', 300);
  expect(board.dataset.panning).toBeUndefined();
  press(board, 'pointermove', 200);
  expect(board.scrollLeft).toBe(100);
});
