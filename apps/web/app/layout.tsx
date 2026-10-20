import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { I18nProvider } from '../src/i18n';
import { AnalyticsProvider } from '../src/analytics/provider';
import { DevStyleGuard } from '../src/dev/DevStyleGuard';
import '@excalidraw/excalidraw/index.css';
import '../src/index.css';
import '../src/styles/home/index.css';
// These hosts render from the client-only App entry. Keep their layout CSS in
// the root route stylesheet so Turbopack does not leave the lazy chunk as a
// preload-only resource after the host mounts.
import '../src/components/TestCampaignModal.module.css';
import '../src/components/HoverTouchpointOverlay.module.css';
import '../src/components/ProductionCampaignBadge.module.css';
import '../src/components/OnboardingWelcome.module.css';

export const metadata: Metadata = {
  title: 'Lev Design',
  icons: {
    icon: '/app-icon.png',
    apple: '/app-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#f7f7f7',
};

/**
 * Inline script that runs before React hydrates so the first paint already
 * carries the app's appearance — no flash of unstyled content.
 *
 * `data-theme` is stamped with the RESOLVED theme (`light` or `dark`, never
 * `system`): the stored choice, or the OS preference when it is `system` or
 * the config predates the setting. A failed storage read still leaves a
 * `light` stamp, because every dark CSS rule is gated on the attribute.
 * Keep the accent variable mix ratios in sync with `accentVars()` in
 * `src/state/appearance.ts`; this script cannot import application modules.
 */
const themeInitScript = `(function(){try{var c=JSON.parse(localStorage.getItem('open-design:config')||'{}');var t=c.theme==='light'||c.theme==='dark'?c.theme:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');if(c.configMigrationVersion<4)t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t);var a=typeof c.accentColor==='string'&&/^#[0-9a-fA-F]{6}$/.test(c.accentColor.trim())?c.accentColor.trim().toLowerCase():'#353535';if(c.configMigrationVersion<3&&(a==='#87ea5c'||a==='#c96442'))a='#353535';var s=document.documentElement.style;if(a==='#353535'&&t==='dark')return;s.setProperty('--accent',a);s.setProperty('--accent-strong','color-mix(in srgb, '+a+' 82%, var(--text-strong))');s.setProperty('--accent-soft','color-mix(in srgb, '+a+' 12%, var(--bg-subtle))');s.setProperty('--accent-tint','color-mix(in srgb, '+a+' 6%, var(--bg-panel))');s.setProperty('--accent-hover','color-mix(in srgb, '+a+' 86%, var(--text-strong))');}catch(e){if(!document.documentElement.getAttribute('data-theme'))document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang='en' suppressHydrationWarning>
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: intentional theme-init inline script to prevent FOUC */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body suppressHydrationWarning>
        {/* Dev only: reloads when the hot reload drops a stylesheet chunk. */}
        <DevStyleGuard />
        <I18nProvider>
          <AnalyticsProvider>{children}</AnalyticsProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
