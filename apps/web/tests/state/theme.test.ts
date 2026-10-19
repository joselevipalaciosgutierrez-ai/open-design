// @vitest-environment jsdom
//
// The theme setting: light, dark, or following the system. These specs pin the
// invariant at the three places a theme reaches the document — the config
// parser, the runtime applier, and the pre-hydration inline script that paints
// before React mounts. `data-theme` is always a RESOLVED light/dark, never
// `system`, because every dark rule in the app is gated on it.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyAppearanceToDocument,
  resolveAppTheme,
  resolveEffectiveTheme,
  watchSystemTheme,
} from '../../src/state/appearance';
import { DEFAULT_CONFIG, loadConfig } from '../../src/state/config';
import type { AppConfig } from '../../src/types';

const STORAGE_KEY = 'open-design:config';
const store = new Map<string, string>();

function stubStorage(): void {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  });
}

// `vi.unstubAllGlobals()` below also drops the storage stub, so it is put back
// before every spec.
beforeEach(stubStorage);

function persist(config: Partial<AppConfig>): void {
  store.set(STORAGE_KEY, JSON.stringify(config));
}

/** Pretend the OS is (or is not) in dark mode. */
function stubSystem(dark: boolean) {
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: dark && query.includes('prefers-color-scheme: dark'),
      media: query,
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    })),
  );
  return listeners;
}

describe('theme — resolving', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('defaults to following the system and rejects unknown values', () => {
    expect(resolveAppTheme(undefined)).toBe('system');
    expect(resolveAppTheme('purple' as never)).toBe('system');
    expect(resolveAppTheme('dark')).toBe('dark');
    expect(resolveAppTheme('light')).toBe('light');
  });

  it('resolves system from the OS and leaves explicit choices alone', () => {
    stubSystem(true);
    expect(resolveEffectiveTheme('system')).toBe('dark');
    expect(resolveEffectiveTheme('light')).toBe('light');
    stubSystem(false);
    expect(resolveEffectiveTheme('system')).toBe('light');
    expect(resolveEffectiveTheme('dark')).toBe('dark');
  });

  it('tells the caller when the OS changes theme, and stops on unsubscribe', () => {
    const listeners = stubSystem(false);
    const onChange = vi.fn();
    const stop = watchSystemTheme(onChange);
    expect(listeners.size).toBe(1);
    stop();
    expect(listeners.size).toBe(0);
  });
});

describe('theme — persisted config', () => {
  beforeEach(() => store.clear());

  it('defaults a fresh install to following the system', () => {
    expect(DEFAULT_CONFIG.theme).toBe('system');
    expect(loadConfig().theme).toBe('system');
  });

  it('moves an install saved before the setting returned to the system theme, once', () => {
    persist({ theme: 'light', configMigrationVersion: 3, accentColor: '#4F46E5' });

    const config = loadConfig();

    expect(config.theme).toBe('system');
    expect(config.accentColor).toBe('#4f46e5');
    const written = JSON.parse(store.get(STORAGE_KEY) ?? '{}') as Partial<AppConfig>;
    expect(written.theme).toBe('system');
  });

  it('keeps the user’s own choice once the setting has been migrated', () => {
    persist({ theme: 'dark', configMigrationVersion: 4 });
    expect(loadConfig().theme).toBe('dark');
    persist({ theme: 'light', configMigrationVersion: 4 });
    expect(loadConfig().theme).toBe('light');
  });
});

describe('theme — document', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    vi.unstubAllGlobals();
  });

  it('stamps the explicit choice', () => {
    applyAppearanceToDocument({ accentColor: '#059669', theme: 'dark' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applyAppearanceToDocument({ accentColor: '#059669', theme: 'light' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('stamps the RESOLVED system theme, never "system"', () => {
    stubSystem(true);
    applyAppearanceToDocument({ accentColor: '#059669', theme: 'system' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    stubSystem(false);
    applyAppearanceToDocument({ accentColor: '#059669', theme: 'system' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

describe('theme — default accent', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
  });

  it('leaves the default accent to the dark tokens, but still stamps a chosen one', () => {
    applyAppearanceToDocument({ theme: 'light' });
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#353535');

    applyAppearanceToDocument({ theme: 'dark' });
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');

    applyAppearanceToDocument({ theme: 'dark', accentColor: '#1A74FF' });
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#1a74ff');
  });
});

describe('theme — pre-hydration script', () => {
  const layoutPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../app/layout.tsx');

  function runThemeInitScript(): void {
    const source = readFileSync(layoutPath, 'utf8');
    const match = /const themeInitScript = `([^`]*)`;/.exec(source);
    if (!match?.[1]) throw new Error('themeInitScript not found in app/layout.tsx');
    // eslint-disable-next-line no-new-func
    new Function(match[1])();
  }

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    store.clear();
    vi.unstubAllGlobals();
  });

  it('paints the stored explicit theme', () => {
    stubSystem(false);
    persist({ theme: 'dark', configMigrationVersion: 4 });
    runThemeInitScript();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('paints the OS theme for system, and for a config saved before the setting returned', () => {
    stubSystem(true);
    persist({ theme: 'system', configMigrationVersion: 4 });
    runThemeInitScript();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    document.documentElement.removeAttribute('data-theme');
    persist({ theme: 'light', configMigrationVersion: 3 });
    runThemeInitScript();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('falls back to light when nothing can be read and the OS is light', () => {
    stubSystem(false);
    runThemeInitScript();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
