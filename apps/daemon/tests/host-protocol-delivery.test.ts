import { describe, expect, it } from 'vitest';

import { renderChatTurnHostProtocolInstructions } from '@open-design/contracts';
import { formatDesignFilesWorkspaceHint, splitDesignFilesWorkspaceHint } from '../src/runtimes/chat-prompt-inputs.js';
import { hostProtocolDelivery, resolveHostProtocolMode } from '../src/host-protocol-delivery.js';

const KEY = '0123456789abcdef';
const FILES = [{ path: 'zz-unique-page.html', kind: 'html', size: 1200 }];

describe('design files workspace hint, split', () => {
  it('fixed part plus snapshot is the old hint, byte for byte', () => {
    for (const files of [[], FILES]) {
      const whole = formatDesignFilesWorkspaceHint('/work/p1', files, []);
      const { fixed, snapshot } = splitDesignFilesWorkspaceHint('/work/p1', files, []);
      expect([fixed, snapshot].join('\n')).toBe(whole);
    }
  });

  it('keeps the file list out of the fixed part and the rules out of the snapshot', () => {
    const { fixed, snapshot } = splitDesignFilesWorkspaceHint('/work/p1', FILES, []);
    expect(fixed).toContain('/work/p1');
    expect(fixed).not.toContain('zz-unique-page.html');
    expect(snapshot).toContain('zz-unique-page.html');
    expect(snapshot).not.toContain('semantic filenames');
  });

  it('fixed part does not move when files change', () => {
    const a = splitDesignFilesWorkspaceHint('/work/p1', [], []).fixed;
    const b = splitDesignFilesWorkspaceHint('/work/p1', FILES, []).fixed;
    expect(a).toBe(b);
  });

  it('returns nothing without a working directory', () => {
    expect(splitDesignFilesWorkspaceHint('', FILES, [])).toEqual({ fixed: '', snapshot: '' });
  });
});

describe('host protocol delivery', () => {
  it('split mode sends the rules once and only the key per turn', () => {
    const d = hostProtocolDelivery({ mode: 'split', key: KEY, locale: undefined });
    expect(d.stable).toContain('TURN_KEY');
    expect(d.stable).not.toContain(KEY);
    expect(d.perTurn.join('\n')).toBe(`Turn key: ${KEY}`);
  });

  it('inline mode is the old behaviour exactly', () => {
    const old = renderChatTurnHostProtocolInstructions(KEY, 'ordinary', undefined);
    const d = hostProtocolDelivery({ mode: 'inline', key: KEY, locale: undefined });
    expect(d.stable).toBe('');
    expect(d.perTurn).toEqual([old.doneMarker, old.nextSteps, old.artifactFocus]);
  });

  it('sends nothing without a key', () => {
    expect(hostProtocolDelivery({ mode: 'split', key: '', locale: undefined })).toEqual({ stable: '', perTurn: [] });
  });

  it('inline is the opt-out switch; split is the default', () => {
    expect(resolveHostProtocolMode(undefined)).toBe('split');
    expect(resolveHostProtocolMode('inline')).toBe('inline');
    expect(resolveHostProtocolMode('whatever')).toBe('split');
  });
});
