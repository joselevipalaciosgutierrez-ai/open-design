import { describe, expect, it } from 'vitest';

import { canReload, lostStylesheets, stylesheetKey } from '../../src/dev/style-guard';

describe('stylesheetKey', () => {
  it('ignores the cache-buster the hot reload rewrites', () => {
    expect(stylesheetKey('http://127.0.0.1:1/_next/static/css/app/layout.css?v=111')).toBe(
      '/_next/static/css/app/layout.css',
    );
    expect(stylesheetKey('http://127.0.0.1:1/_next/static/css/app/layout.css?v=222')).toBe(
      '/_next/static/css/app/layout.css',
    );
  });

  it('keeps relative hrefs and drops hashes', () => {
    expect(stylesheetKey('/_next/static/css/a.css#x')).toBe('/_next/static/css/a.css');
  });
});

describe('lostStylesheets', () => {
  const known = new Set(['/css/layout.css', '/css/page.css', '/css/chunk-entry.css']);

  it('reports a chunk that vanished', () => {
    expect(lostStylesheets(known, new Set(['/css/layout.css', '/css/page.css']))).toEqual(['/css/chunk-entry.css']);
  });

  it('is quiet when a chunk only got a new cache-buster, because its key is unchanged', () => {
    expect(lostStylesheets(known, new Set(known))).toEqual([]);
  });

  it('is quiet when new chunks appeared', () => {
    expect(lostStylesheets(known, new Set([...known, '/css/new.css']))).toEqual([]);
  });
});

describe('canReload', () => {
  const limit = { max: 3, windowMs: 20_000 };

  it('allows a reload when none happened recently', () => {
    expect(canReload([], 1_000_000, limit)).toBe(true);
  });

  it('stops after the limit inside the window, so a missing stylesheet cannot loop', () => {
    const now = 1_000_000;
    expect(canReload([now - 3000, now - 2000, now - 1000], now, limit)).toBe(false);
  });

  it('forgets reloads older than the window', () => {
    const now = 1_000_000;
    expect(canReload([now - 60_000, now - 50_000, now - 40_000, now - 1000], now, limit)).toBe(true);
  });
});
