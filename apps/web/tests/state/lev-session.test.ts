import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchLevSpace,
  forgetCurrentLevSession,
  levSession,
  resetLevSessionForTests,
  resumeLevSession,
  startLevSession,
} from '../../src/state/lev-session';

afterEach(() => {
  resetLevSessionForTests();
  vi.unstubAllGlobals();
});

describe('Lev session', () => {
  it('finds Lev and starts a new session in his space', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url === '/api/orchestrator'
        ? new Response(JSON.stringify({ projectId: 'lev', sessions: [] }), { status: 200 })
        : new Response(JSON.stringify({ conversation: { id: 's1' } }), { status: 200 }),
    ));
    const space = await fetchLevSpace();
    expect(space.projectId).toBe('lev');
    expect(await startLevSession('lev')).toBe('s1');
    expect(levSession()).toEqual({ projectId: 'lev', sessionId: 's1' });
  });

  it('resumes an earlier session and forgets it when the chat starts fresh', () => {
    resumeLevSession('lev', 'old');
    expect(levSession().sessionId).toBe('old');
    forgetCurrentLevSession();
    expect(levSession()).toEqual({ projectId: 'lev', sessionId: null });
  });
});
