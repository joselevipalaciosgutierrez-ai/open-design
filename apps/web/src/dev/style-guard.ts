/**
 * Decisions for the dev-only stylesheet guard (`DevStyleGuard.tsx`).
 *
 * In `next dev` (webpack), changing which CSS modules a lazy chunk contains can
 * make the hot reload DROP that chunk's `<link>` from the document without
 * loading a replacement: no 404, no console error, the page just loses every
 * component's module styles and keeps only the global ones. A reload fixes it
 * every time, so the guard performs it. This is not a production concern.
 */

/** A stylesheet's identity: its path, never the `?v=` cache-buster HMR rewrites. */
export function stylesheetKey(href: string): string {
  try {
    return new URL(href, 'http://localhost').pathname;
  } catch {
    return href.split(/[?#]/)[0] ?? href;
  }
}

/**
 * Chunks that were on the page and are gone. A chunk whose `?v=` changed keeps
 * its key and is therefore not lost; only one that vanished entirely is.
 */
export function lostStylesheets(known: ReadonlySet<string>, current: ReadonlySet<string>): string[] {
  return [...known].filter((key) => !current.has(key));
}

export interface ReloadLimit {
  /** Reloads allowed inside `windowMs`. */
  max: number;
  windowMs: number;
}

export const DEFAULT_RELOAD_LIMIT: ReloadLimit = { max: 3, windowMs: 20_000 };

/**
 * Whether another reload is allowed. A guard that can reload forever turns a
 * missing stylesheet into a refresh loop, so it stops after a few and leaves the
 * page for the developer.
 */
export function canReload(
  recentReloadTimes: readonly number[],
  now: number,
  limit: ReloadLimit = DEFAULT_RELOAD_LIMIT,
): boolean {
  return recentReloadTimes.filter((at) => now - at < limit.windowMs).length < limit.max;
}
