import { useSyncExternalStore } from 'react';

/**
 * Whose to-dos the workbench shows: only the reader's part (`mine`, 我的,
 * the default since 2026-10-22) or the team's (`all`). Remembered in this
 * browser, which is a convenience — blocked storage only means it starts at
 * the reader's again. The sidebar's number counts the reader's whatever the
 * board is set to (`navigation-counts.ts`).
 */
export type WorkScope = 'all' | 'mine';

const KEY = 'nocoitam:work-scope';
const listeners = new Set<() => void>();

function read(): WorkScope {
  try {
    return localStorage.getItem(KEY) === 'all' ? 'all' : 'mine';
  } catch {
    return 'mine';
  }
}

let current: WorkScope | undefined;

export function setWorkScope(scope: WorkScope): void {
  current = scope;
  try {
    localStorage.setItem(KEY, scope);
  } catch {
    // Storage unavailable: kept for this page load only.
  }
  for (const listener of listeners) listener();
}

export function useWorkScope(): WorkScope {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (current ??= read()),
    () => 'mine',
  );
}
