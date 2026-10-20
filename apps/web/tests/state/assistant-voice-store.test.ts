import { describe, expect, it } from 'vitest';

import { markSpokenTurn, takeSpokenTurn } from '../../src/state/assistant-voice-store';

describe('spoken turn mark', () => {
  it('marks exactly one turn', () => {
    markSpokenTurn(1000);
    expect(takeSpokenTurn(1500)).toBe(true);
    expect(takeSpokenTurn(1600)).toBe(false);
  });

  it('expires, so a request that never became a turn cannot mark a typed one', () => {
    markSpokenTurn(1000);
    expect(takeSpokenTurn(1000 + 61_000)).toBe(false);
  });

  it('is off until something was said', () => {
    expect(takeSpokenTurn(5000)).toBe(false);
  });
});
