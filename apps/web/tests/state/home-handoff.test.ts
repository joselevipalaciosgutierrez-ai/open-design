import { describe, expect, it } from 'vitest';

import { markHomeHandoff, takeHomeHandoff } from '../../src/state/home-handoff';

describe('home hand-off mark', () => {
  it('is taken once by the project Home opened', () => {
    markHomeHandoff(1000);
    expect(takeHomeHandoff(1400)).toBe(true);
    expect(takeHomeHandoff(1500)).toBe(false);
  });

  it('expires, so a project opened later another way does not fade in', () => {
    markHomeHandoff(1000);
    expect(takeHomeHandoff(6000)).toBe(false);
  });
});
