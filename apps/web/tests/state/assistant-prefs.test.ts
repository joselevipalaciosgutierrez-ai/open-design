// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VOICE_PREFS, readVoicePrefs, writeVoicePrefs } from '../../src/state/assistant-prefs';

beforeEach(() => window.localStorage.clear());

describe('assistant prefs', () => {
  it('starts with sensible defaults', () => {
    expect(readVoicePrefs()).toEqual(DEFAULT_VOICE_PREFS);
    expect(DEFAULT_VOICE_PREFS.speakReplies).toBe(true);
    expect(DEFAULT_VOICE_PREFS.auraPreset).toBe('siri');
    expect(DEFAULT_VOICE_PREFS.auraColor).toBe('#ff4fa3');
  });

  it('remembers what was chosen', () => {
    const chosen = { speakReplies: false, voiceId: 'Paulina (Español (México))', rate: 0.9, auraPreset: 'custom' as const, auraColor: '#f472b6' };
    writeVoicePrefs(chosen);
    expect(readVoicePrefs()).toEqual(chosen);
  });

  it('keeps the rate in range and ignores a bad colour or a broken file', () => {
    window.localStorage.setItem('od:assistant-voice', JSON.stringify({ rate: 9, auraColor: 'blue' }));
    expect(readVoicePrefs()).toMatchObject({ rate: 1.4, auraColor: '#ff4fa3', auraPreset: 'siri' });
    window.localStorage.setItem('od:assistant-voice', '{nope');
    expect(readVoicePrefs()).toEqual(DEFAULT_VOICE_PREFS);
  });

  it('tells subscribers when the prefs change', async () => {
    const { useVoicePrefs } = await import('../../src/state/assistant-prefs');
    expect(typeof useVoicePrefs).toBe('function');
    const spy = vi.fn();
    window.addEventListener('storage', spy);
    writeVoicePrefs({ ...DEFAULT_VOICE_PREFS, rate: 1.1 });
    expect(readVoicePrefs().rate).toBe(1.1);
    window.removeEventListener('storage', spy);
  });
});
