import { describe, expect, it } from 'vitest';

import { mouthFromRms } from '../../src/runtime/assistant/speech-player';

describe('mouthFromRms', () => {
  it('keeps the mouth shut on silence and breath', () => {
    expect(mouthFromRms(0)).toBe(0);
    expect(mouthFromRms(0.01)).toBe(0);
  });

  it('opens with the sound and never past wide open', () => {
    expect(mouthFromRms(0.06)).toBeGreaterThan(0.2);
    expect(mouthFromRms(0.06)).toBeLessThan(mouthFromRms(0.12));
    expect(mouthFromRms(0.9)).toBe(1);
  });
});
