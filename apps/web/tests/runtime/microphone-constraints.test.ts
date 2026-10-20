import { describe, expect, it } from 'vitest';

import { microphoneConstraints } from '../../src/components/assistant/use-voice-assistant';

describe('microphoneConstraints', () => {
  it('always asks for a clean voice: no echo, no noise, a steady level, one channel', () => {
    expect(microphoneConstraints()).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    });
  });

  it('adds voice isolation only where the browser knows it', () => {
    expect(microphoneConstraints({ voiceIsolation: true })).toMatchObject({ voiceIsolation: true });
    expect(microphoneConstraints({ voiceIsolation: false })).not.toHaveProperty('voiceIsolation');
  });
});
