// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssistantSettings } from '../../src/components/appearance/AssistantSettings';
import { I18nProvider } from '../../src/i18n';
import { readVoicePrefs } from '../../src/state/assistant-prefs';

const VOICES = [
  { id: 'Paulina (Español (México))', name: 'Paulina', lang: 'es-MX', quality: 'standard' },
  { id: 'Jimena (Premium)', name: 'Jimena', lang: 'es-MX', quality: 'premium' },
  { id: 'Samantha', name: 'Samantha', lang: 'en-US', quality: 'standard' },
];

let calls: Array<{ url: string; body?: string }> = [];

function mockFetch(opts: { voices?: typeof VOICES; sttAvailable?: boolean; tts?: boolean } = {}) {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
    calls.push({ url, ...(init?.body ? { body: init.body } : {}) });
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    if (url === '/api/speech/voices') return json({ supported: opts.tts !== false, voices: opts.voices ?? VOICES });
    if (url === '/api/speech/status') {
      return json({
        tts: { supported: opts.tts !== false, voices: (opts.voices ?? VOICES).length, speaking: false },
        stt: opts.sttAvailable ? { available: true, engine: 'whisper-cpp' } : { available: false, engine: null, reason: 'binary-missing' },
      });
    }
    return json({ ok: true, stopped: false });
  }));
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(locale: 'es-ES' | 'en' = 'es-ES') {
  render(
    <I18nProvider initial={locale}>
      <AssistantSettings lang={locale === 'en' ? 'en-US' : 'es-MX'} />
    </I18nProvider>,
  );
}

describe('AssistantSettings', () => {
  it('lists the voices, the ones in the app\'s language first, and remembers the choice', async () => {
    mockFetch();
    setup();
    const select = (await screen.findByTestId('assistant-voice-select')) as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(4));
    const labels = [...select.options].map((o) => o.textContent);
    expect(labels[0]).toBe('Automática (la mejor disponible)');
    expect(labels[3]).toContain('Samantha');
    expect(labels.some((l) => l?.includes('Jimena') && l.includes('Premium'))).toBe(true);
    fireEvent.change(select, { target: { value: 'Jimena (Premium)' } });
    expect(readVoicePrefs().voiceId).toBe('Jimena (Premium)');
    fireEvent.change(select, { target: { value: '' } });
    expect(readVoicePrefs().voiceId).toBeNull();
  });

  it('tells where to get nicer voices only when none is installed', async () => {
    mockFetch({ voices: VOICES.filter((v) => v.quality === 'standard') as typeof VOICES });
    setup();
    expect(await screen.findByTestId('assistant-voice-tip')).toBeTruthy();
    cleanup();
    mockFetch();
    setup();
    await screen.findByTestId('assistant-voice-select');
    await waitFor(() => expect(screen.queryByTestId('assistant-voice-tip')).toBeNull());
  });

  it('has no aura to choose: the monkey has none', async () => {
    mockFetch();
    setup();
    await screen.findByTestId('assistant-settings');
    expect(screen.queryByTestId('aura-swatch-siri')).toBeNull();
    expect(screen.queryByTestId('aura-custom')).toBeNull();
  });

  it('sets the speed and whether replies are read aloud', async () => {
    mockFetch();
    setup();
    fireEvent.change(screen.getByTestId('assistant-rate'), { target: { value: '0.85' } });
    expect(readVoicePrefs().rate).toBeCloseTo(0.85, 2);
    fireEvent.click(screen.getByTestId('assistant-speak-replies'));
    expect(readVoicePrefs().speakReplies).toBe(false);
  });

  it('plays a sample with the chosen voice and speed', async () => {
    mockFetch();
    setup();
    const select = await screen.findByTestId('assistant-voice-select');
    await waitFor(() => expect((select as HTMLSelectElement).options.length).toBe(4));
    fireEvent.change(select, { target: { value: 'Jimena (Premium)' } });
    fireEvent.change(screen.getByTestId('assistant-rate'), { target: { value: '1.1' } });
    await act(async () => { fireEvent.click(screen.getByTestId('assistant-voice-test')); });
    const speak = calls.find((c) => c.url === '/api/speech/speak');
    expect(speak).toBeTruthy();
    const body = JSON.parse(speak!.body!);
    expect(body.voiceId).toBe('Jimena (Premium)');
    expect(body.rate).toBeCloseTo(1.1, 2);
    expect(body.text).toContain('asistente');
  });

  it('says whether the assistant can hear', async () => {
    mockFetch({ sttAvailable: false });
    setup();
    await waitFor(() => expect(screen.getByTestId('assistant-listen-status').textContent).toContain('Sin instalar'));
    cleanup();
    mockFetch({ sttAvailable: true });
    setup('en');
    await waitFor(() => expect(screen.getByTestId('assistant-listen-status').textContent).toContain('Ready: whisper-cpp'));
  });

  it('says so when the machine has no voices', async () => {
    mockFetch({ tts: false, voices: [] });
    setup();
    await waitFor(() => expect(screen.queryByTestId('assistant-voice-select')).toBeNull());
    expect(screen.getByText('Este equipo no tiene voces del sistema disponibles.')).toBeTruthy();
  });
});
