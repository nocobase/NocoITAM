import { useRef, useState, type DragEvent } from 'react';

const carriesFiles = (event: DragEvent): boolean =>
  event.dataTransfer.types.includes('Files');

/**
 * Whether files are being dragged over a drop target, so the target can light
 * up while they are (2026-10-16: the comment box and the ask box took a drop
 * without showing they would). Entering a child of the target fires a leave
 * on the target before the enter on the child, so the depth counts them.
 * Spread `bind` on the target beside its own `onDragOver` / `onDrop`.
 */
export function useFileDrag(enabled = true): {
  readonly over: boolean;
  readonly bind: {
    readonly onDragEnter: (event: DragEvent) => void;
    readonly onDragLeave: (event: DragEvent) => void;
    readonly onDropCapture: () => void;
  };
} {
  const [over, setOver] = useState(false);
  const depthRef = useRef(0);
  return {
    over: enabled && over,
    bind: {
      onDragEnter: (event) => {
        if (!enabled || !carriesFiles(event)) return;
        depthRef.current += 1;
        setOver(true);
      },
      onDragLeave: (event) => {
        if (!enabled || !carriesFiles(event)) return;
        depthRef.current = Math.max(0, depthRef.current - 1);
        if (depthRef.current === 0) setOver(false);
      },
      onDropCapture: () => {
        depthRef.current = 0;
        setOver(false);
      },
    },
  };
}
