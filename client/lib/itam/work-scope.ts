import { useSyncExternalStore } from 'react';

/**
 * Whose to-dos the workbench and the inbox show: the team's (`all`, the
 * default) or only the reader's part (`mine`, 我负责的). One choice for both
 * pages and the greeting's count, so they never disagree; remembered in this
 * browser, which is a convenience — blocked storage only means it starts at
 * the team's again.
 */
export type WorkScope = 'all' | 'mine';

const KEY = 'nocoitam:work-scope';
const listeners = new Set<() => void>();

function read(): WorkScope {
  try {
    return localStorage.getItem(KEY) === 'mine' ? 'mine' : 'all';
  } catch {
    return 'all';
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
    () => 'all',
  );
}
