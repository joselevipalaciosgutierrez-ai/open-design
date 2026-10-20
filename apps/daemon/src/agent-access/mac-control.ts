/**
 * Controls the Mac on an agent's behalf: open an app or a page, type, press
 * keys, click, take a screenshot. The daemon does it (agents stay sandboxed),
 * only while the person has "Mac control" on, and never into apps where a few
 * keystrokes reach past the sandbox: terminals, System Settings, keychains,
 * script editors. Those the person drives themself.
 */
import { execFile } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

import type { MacControlAction, MacControlResult, MacControlStatus } from '@open-design/contracts';

/** Apps the agent may open but never type, press keys or click into. */
export const GUARDED_APPS = [
  'Terminal',
  'iTerm2',
  'Warp',
  'Ghostty',
  'kitty',
  'Alacritty',
  'WezTerm',
  'Hyper',
  'Tabby',
  'System Settings',
  'System Preferences',
  'Keychain Access',
  'Passwords',
  '1Password',
  'Script Editor',
  'Automator',
  'Shortcuts',
  'Activity Monitor',
  'Disk Utility',
  'Installer',
  'Migration Assistant',
];

export function isGuardedApp(name: string | null | undefined): boolean {
  if (!name) return false;
  const lower = name.trim().toLowerCase();
  return GUARDED_APPS.some((app) => app.toLowerCase() === lower);
}

/** AppleScript string literal. */
export function appleScriptString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

const KEY_CODES: Record<string, number> = {
  enter: 36,
  return: 36,
  tab: 48,
  space: 49,
  delete: 51,
  backspace: 51,
  esc: 53,
  escape: 53,
  left: 123,
  right: 124,
  down: 125,
  up: 126,
  home: 115,
  end: 119,
  pageup: 116,
  pagedown: 121,
};

const MODIFIERS: Record<string, string> = {
  cmd: 'command down',
  command: 'command down',
  shift: 'shift down',
  alt: 'option down',
  option: 'option down',
  ctrl: 'control down',
  control: 'control down',
};

/** `cmd+shift+l`, `enter`, `cmd+t` → the System Events line that presses it, or null. */
export function keyComboScript(combo: string): string | null {
  const parts = combo.toLowerCase().split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const key = parts[parts.length - 1]!;
  const mods: string[] = [];
  for (const part of parts.slice(0, -1)) {
    const mod = MODIFIERS[part];
    if (!mod) return null;
    mods.push(mod);
  }
  const using = mods.length > 0 ? ` using {${mods.join(', ')}}` : '';
  if (key in KEY_CODES) return `key code ${KEY_CODES[key]}${using}`;
  if (key.length === 1) return `keystroke ${appleScriptString(key)}${using}`;
  return null;
}

export interface MacRunner {
  run: (bin: string, args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;
}

export const systemMacRunner: MacRunner = {
  run: (bin, args) =>
    new Promise((resolve) => {
      execFile(bin, args, { timeout: 20_000 }, (error, stdout, stderr) => {
        const code = error ? (typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : 1) : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      });
    }),
};

export function createMacControl(options: {
  enabled: () => Promise<boolean>;
  screensDir: string;
  platform?: NodeJS.Platform;
  runner?: MacRunner;
  now?: () => number;
}) {
  const platform = options.platform ?? process.platform;
  const runner = options.runner ?? systemMacRunner;
  const supported = platform === 'darwin';

  const osascript = (script: string) => runner.run('osascript', ['-e', script]);

  async function frontApp(): Promise<string | null> {
    const out = await osascript('tell application "System Events" to get name of first application process whose frontmost is true');
    return out.code === 0 ? out.stdout.trim() : null;
  }

  async function status(): Promise<MacControlStatus> {
    const enabled = await options.enabled();
    if (!supported) return { enabled, supported, accessibility: null };
    const out = await osascript('tell application "System Events" to get UI elements enabled');
    return { enabled, supported, accessibility: out.code === 0 ? out.stdout.trim() === 'true' : null };
  }

  /** Typing, keys and clicks go to the frontmost app: refuse the guarded ones. */
  async function guardFront(): Promise<string | null> {
    const app = await frontApp();
    if (isGuardedApp(app)) return `${app} is in front. Typing, keys and clicks never go into it; ask the person to do this step.`;
    return null;
  }

  async function act(action: MacControlAction): Promise<MacControlResult> {
    if (!supported) return { ok: false, error: 'Mac control needs macOS.' };
    if (!(await options.enabled())) {
      return { ok: false, error: 'Mac control is off. The person can turn it on in Settings.' };
    }
    switch (action.action) {
      case 'open': {
        const args: string[] = [];
        if (action.app) {
          if (/[\/\0]/.test(action.app)) return { ok: false, error: 'An app is named, not given as a path.' };
          args.push('-a', action.app);
        }
        if (action.url) {
          if (!/^https?:\/\//i.test(action.url)) return { ok: false, error: 'Only http and https links can be opened.' };
          args.push(action.url);
        }
        if (args.length === 0) return { ok: false, error: 'Name an app, a link, or both.' };
        const out = await runner.run('open', args);
        return out.code === 0 ? { ok: true } : { ok: false, error: out.stderr.trim() || 'It could not be opened.' };
      }
      case 'type': {
        const refused = await guardFront();
        if (refused) return { ok: false, error: refused };
        const out = await osascript(`tell application "System Events" to keystroke ${appleScriptString(action.text)}`);
        return out.code === 0 ? { ok: true } : { ok: false, error: accessibilityHint(out.stderr) };
      }
      case 'key': {
        const line = keyComboScript(action.combo);
        if (!line) return { ok: false, error: `Unknown key combination: ${action.combo}` };
        const refused = await guardFront();
        if (refused) return { ok: false, error: refused };
        const out = await osascript(`tell application "System Events" to ${line}`);
        return out.code === 0 ? { ok: true } : { ok: false, error: accessibilityHint(out.stderr) };
      }
      case 'click': {
        if (!Number.isFinite(action.x) || !Number.isFinite(action.y)) return { ok: false, error: 'x and y are numbers.' };
        const refused = await guardFront();
        if (refused) return { ok: false, error: refused };
        const out = await osascript(
          `tell application "System Events" to click at {${Math.round(action.x)}, ${Math.round(action.y)}}`,
        );
        return out.code === 0 ? { ok: true } : { ok: false, error: accessibilityHint(out.stderr) };
      }
      case 'screenshot': {
        await fsp.mkdir(options.screensDir, { recursive: true });
        const file = path.join(options.screensDir, `screen-${(options.now ?? Date.now)()}.png`);
        const out = await runner.run('screencapture', ['-x', file]);
        return out.code === 0
          ? { ok: true, value: file }
          : { ok: false, error: 'The screen could not be captured. macOS may need Screen Recording allowed for the app.' };
      }
      case 'front-app': {
        const app = await frontApp();
        return app ? { ok: true, value: app } : { ok: false, error: accessibilityHint('') };
      }
      default:
        return { ok: false, error: 'Unknown action.' };
    }
  }

  return { supported, status, act };
}

function accessibilityHint(stderr: string): string {
  const detail = stderr.trim();
  return `macOS refused. Allow the app under System Settings, Privacy & Security, Accessibility.${detail ? ` (${detail})` : ''}`;
}

export type MacControl = ReturnType<typeof createMacControl>;
