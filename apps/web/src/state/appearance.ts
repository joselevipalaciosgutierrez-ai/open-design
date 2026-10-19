import { getOpenDesignHost } from '@open-design/host';
import type { AppTheme } from '../types';

const ACCENT_VARS = [
  '--accent',
  '--accent-strong',
  '--accent-soft',
  '--accent-tint',
  '--accent-hover',
] as const;

export const DEFAULT_ACCENT_COLOR = '#353535';
export const ACCENT_SWATCHES = [
  DEFAULT_ACCENT_COLOR,
  '#202020',
  '#848484',
  '#87ea5c',
  '#0d5400',
  '#1A74FF',
  '#FFBA12',
  '#FF7528',
  '#F04142',
] as const;

export function normalizeAccentColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function resolveAccentColor(value: unknown): string {
  return normalizeAccentColor(value) ?? DEFAULT_ACCENT_COLOR;
}

function accentVars(accentColor: string): Record<(typeof ACCENT_VARS)[number], string> {
  return {
    '--accent': accentColor,
    // Keep these mix ratios in sync with the pre-hydration script in app/layout.tsx.
    '--accent-strong': `color-mix(in srgb, ${accentColor} 82%, var(--text-strong))`,
    '--accent-soft': `color-mix(in srgb, ${accentColor} 12%, var(--bg-subtle))`,
    '--accent-tint': `color-mix(in srgb, ${accentColor} 6%, var(--bg-panel))`,
    '--accent-hover': `color-mix(in srgb, ${accentColor} 86%, var(--text-strong))`,
  };
}

/**
 * The app's colour theme.
 *
 * `system` follows the OS, live. `data-theme` on <html> is ALWAYS present and
 * always a resolved `light` or `dark`, never `system`: every dark rule in the app
 * is gated on the attribute (`[data-theme="dark"]` in CSS) or reads it directly
 * (`shiki`, `ConnectorLogo`, `SketchEditor`, `TerminalViewer`, …), so resolving
 * here keeps them all in step with one switch. The host window gets the
 * UNRESOLVED choice so the native material (macOS vibrancy) follows the OS by
 * itself when the choice is `system`.
 */
export const DEFAULT_APP_THEME: AppTheme = 'system';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function resolveAppTheme(persisted?: AppTheme | null): AppTheme {
  return persisted === 'light' || persisted === 'dark' || persisted === 'system'
    ? persisted
    : DEFAULT_APP_THEME;
}

/** What the screen should actually look like right now. */
export function resolveEffectiveTheme(theme: AppTheme): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') return theme;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/**
 * Calls `onChange` when the OS switches between light and dark. Returns the
 * unsubscribe. Safe where `matchMedia` is missing (tests, old webviews).
 */
export function watchSystemTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener?.('change', onChange);
  return () => query.removeEventListener?.('change', onChange);
}

export function applyAppearanceToDocument({
  accentColor,
  theme,
}: {
  accentColor?: string;
  theme?: AppTheme | null;
}): void {
  const root = document.documentElement;
  const chosen = resolveAppTheme(theme);
  root.setAttribute('data-theme', resolveEffectiveTheme(chosen));
  // Desktop shell: keep the native window appearance (the macOS vibrancy
  // glass material) in step with the app theme, so a light app over a dark OS
  // does not sit on dark glass and read as muddy gray (#94). Feature-detected —
  // browsers and older host builds have no appearance capability.
  getOpenDesignHost()?.appearance?.setTheme(chosen);

  const normalized = resolveAccentColor(accentColor);
  // The default accent is a dark ink. Stamped inline it would beat the dark
  // theme's own accent tokens and leave every accent-coloured icon and selection
  // dark on dark, so in dark the default is left to the tokens.
  if (normalized === DEFAULT_ACCENT_COLOR && root.getAttribute('data-theme') === 'dark') {
    for (const name of ACCENT_VARS) root.style.removeProperty(name);
    return;
  }
  const vars = accentVars(normalized);
  for (const name of ACCENT_VARS) {
    root.style.setProperty(name, vars[name]);
  }
}
