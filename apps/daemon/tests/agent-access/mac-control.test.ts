import { describe, expect, it } from 'vitest';

import { createMacControl, isGuardedApp, keyComboScript, type MacRunner } from '../../src/agent-access/mac-control.js';
import { parseMacAction } from '../../src/routes/agent-access.js';

function fakeRunner(front = 'Arc') {
  const calls: Array<{ bin: string; args: string[] }> = [];
  const runner: MacRunner = {
    run: async (bin, args) => {
      calls.push({ bin, args });
      if (bin === 'osascript' && args[1]?.includes('frontmost')) return { code: 0, stdout: `${front}\n`, stderr: '' };
      return { code: 0, stdout: 'true\n', stderr: '' };
    },
  };
  return { runner, calls };
}

function control(opts: { enabled?: boolean; front?: string } = {}) {
  const { runner, calls } = fakeRunner(opts.front);
  const mac = createMacControl({
    enabled: async () => opts.enabled ?? true,
    screensDir: '/tmp/od-mac-screens-test',
    platform: 'darwin',
    runner,
    now: () => 42,
  });
  return { mac, calls };
}

describe('mac control', () => {
  it('does nothing while the person has it off', async () => {
    const { mac, calls } = control({ enabled: false });
    expect((await mac.act({ action: 'open', app: 'Arc' })).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('opens an app with a page, and only http(s) pages', async () => {
    const { mac, calls } = control();
    expect(await mac.act({ action: 'open', app: 'Arc', url: 'https://www.youtube.com' })).toEqual({ ok: true });
    expect(calls[0]).toEqual({ bin: 'open', args: ['-a', 'Arc', 'https://www.youtube.com'] });
    expect((await mac.act({ action: 'open', url: 'file:///etc/passwd' })).ok).toBe(false);
    expect((await mac.act({ action: 'open', app: '/Applications/Terminal.app' })).ok).toBe(false);
  });

  it('types into the app in front, escaping quotes', async () => {
    const { mac, calls } = control();
    expect((await mac.act({ action: 'type', text: 'lofi "chill"' })).ok).toBe(true);
    expect(calls.at(-1)!.args[1]).toBe('tell application "System Events" to keystroke "lofi \\"chill\\""');
  });

  it('never types, presses keys or clicks into a terminal or System Settings', async () => {
    for (const front of ['Terminal', 'iTerm2', 'System Settings', 'Keychain Access']) {
      const { mac, calls } = control({ front });
      expect((await mac.act({ action: 'type', text: 'rm -rf ~' })).ok).toBe(false);
      expect((await mac.act({ action: 'key', combo: 'enter' })).ok).toBe(false);
      expect((await mac.act({ action: 'click', x: 10, y: 10 })).ok).toBe(false);
      expect(calls.every((c) => !c.args[1]?.includes('keystroke') && !c.args[1]?.includes('key code') && !c.args[1]?.includes('click at'))).toBe(true);
    }
  });

  it('takes a screenshot into its own folder', async () => {
    const { mac, calls } = control();
    expect(await mac.act({ action: 'screenshot' })).toEqual({ ok: true, value: '/tmp/od-mac-screens-test/screen-42.png' });
    expect(calls.at(-1)).toEqual({ bin: 'screencapture', args: ['-x', '/tmp/od-mac-screens-test/screen-42.png'] });
  });
});

describe('keyComboScript', () => {
  it('turns key names and shortcuts into System Events lines', () => {
    expect(keyComboScript('enter')).toBe('key code 36');
    expect(keyComboScript('cmd+t')).toBe('keystroke "t" using {command down}');
    expect(keyComboScript('cmd+shift+l')).toBe('keystroke "l" using {command down, shift down}');
    expect(keyComboScript('hyper+t')).toBeNull();
    expect(keyComboScript('f99')).toBeNull();
  });

  it('knows which apps are guarded', () => {
    expect(isGuardedApp('terminal')).toBe(true);
    expect(isGuardedApp('Arc')).toBe(false);
  });
});

describe('parseMacAction', () => {
  it('accepts the known actions and refuses the rest', () => {
    expect(parseMacAction({ action: 'open', app: 'Arc' })).toEqual({ action: 'open', app: 'Arc' });
    expect(parseMacAction({ action: 'click', x: 1, y: 2 })).toEqual({ action: 'click', x: 1, y: 2 });
    expect(parseMacAction({ action: 'type', text: '' })).toBeNull();
    expect(parseMacAction({ action: 'shell', cmd: 'ls' })).toBeNull();
  });
});
