'use client';

import { useEffect } from 'react';
import { canReload, lostStylesheets, stylesheetKey } from './style-guard';

const STYLESHEETS = 'link[rel="stylesheet"][href*="/_next/static/css/"]';
const SETTLE_MS = 1500;
const STORAGE_KEY = 'od:dev-style-guard:reloads';

function currentKeys(): Set<string> {
  return new Set(
    Array.from(document.querySelectorAll<HTMLLinkElement>(STYLESHEETS)).map((link) =>
      stylesheetKey(link.href),
    ),
  );
}

function readReloads(): number[] {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

function recordReload(times: number[]): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(times.slice(-10)));
  } catch {
    // Storage can be unavailable; the guard then simply has no loop memory.
  }
}

/**
 * Development only. Reloads the page when the hot reload drops a stylesheet
 * chunk and never brings it back (see `style-guard.ts`). Renders nothing, and in
 * production it does not even observe.
 */
export function DevStyleGuard({
  enabled = process.env.NODE_ENV === 'development',
  reload = () => window.location.reload(),
}: {
  enabled?: boolean;
  reload?: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;
    let known = currentKeys();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = () => {
      timer = null;
      const now = currentKeys();
      const lost = lostStylesheets(known, now);
      // Chunks that loaded since are now part of what must stay; a lost one is
      // reported once, not on every later change.
      known = now;
      if (lost.length === 0) return;
      const times = readReloads();
      if (!canReload(times, Date.now())) {
        console.warn('[dev-style-guard] stylesheet chunk lost, not reloading again:', lost);
        return;
      }
      recordReload([...times, Date.now()]);
      console.warn('[dev-style-guard] stylesheet chunk lost, reloading:', lost);
      reload();
    };

    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(check, SETTLE_MS);
    });
    observer.observe(document.head, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [enabled, reload]);

  return null;
}
