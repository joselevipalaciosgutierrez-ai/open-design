import { flushSync } from 'react-dom';

type DocumentWithTransitions = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

/**
 * Runs a React state change inside a view transition, so the browser animates
 * between the before and after layouts: elements sharing a
 * `view-transition-name` move and resize, the rest crossfade. Without the API,
 * or with reduced motion, the change simply happens.
 */
export function withViewTransition(update: () => void): void {
  const doc = typeof document === 'undefined' ? null : (document as DocumentWithTransitions);
  const reduced =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!doc?.startViewTransition || reduced) {
    update();
    return;
  }
  doc.startViewTransition(() => {
    flushSync(update);
  });
}
