// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  readProjectSessionModeHint,
  rememberProjectSessionMode,
} from '../../src/state/project-session-mode-hint';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('project session-mode hint', () => {
  it('returns nothing for a project that has no hint', () => {
    expect(readProjectSessionModeHint('project-1')).toBeNull();
  });

  it('remembers the mode per project', () => {
    rememberProjectSessionMode('project-1', 'chat');
    rememberProjectSessionMode('project-2', 'design');

    expect(readProjectSessionModeHint('project-1')).toBe('chat');
    expect(readProjectSessionModeHint('project-2')).toBe('design');
  });

  it('ignores a stored value that is not a session mode', () => {
    window.localStorage.setItem('open-design.project.sessionModeHint:project-1', 'banana');

    expect(readProjectSessionModeHint('project-1')).toBeNull();
  });

  it('degrades to no hint when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => rememberProjectSessionMode('project-1', 'chat')).not.toThrow();
    expect(readProjectSessionModeHint('project-1')).toBeNull();
  });
});
