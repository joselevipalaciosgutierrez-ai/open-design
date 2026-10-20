import type { TranscribeResult } from '../runtime/assistant/voice-session';

/**
 * The assistant's voice, as the app reaches it: the daemon speaks with the
 * Mac's voices and listens with whisper.cpp; where the daemon cannot speak
 * (not macOS) the browser's own voice takes over. Never throws.
 */

export interface SpeechStatus {
  tts: { supported: boolean; voices: number; speaking: boolean };
  stt: { available: boolean; engine: string | null; reason?: string };
}

export interface SpeechVoiceInfo {
  id: string;
  name: string;
  lang: string;
  quality: 'premium' | 'enhanced' | 'standard';
}

export type SpeakOutcome = 'done' | 'stopped' | 'failed';

export async function fetchSpeechStatus(): Promise<SpeechStatus | null> {
  try {
    const resp = await fetch('/api/speech/status');
    return resp.ok ? ((await resp.json()) as SpeechStatus) : null;
  } catch {
    return null;
  }
}

export async function fetchSpeechVoices(): Promise<SpeechVoiceInfo[]> {
  try {
    const resp = await fetch('/api/speech/voices');
    if (!resp.ok) return [];
    const body = (await resp.json()) as { voices?: SpeechVoiceInfo[] };
    return Array.isArray(body.voices) ? body.voices : [];
  } catch {
    return [];
  }
}

function speakWithBrowserVoice(text: string, lang: string, rate: number): Promise<SpeakOutcome> {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return Promise.resolve('failed');
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.onend = () => resolve('done');
    utterance.onerror = (e) => resolve(e.error === 'canceled' || e.error === 'interrupted' ? 'stopped' : 'failed');
    synth.cancel();
    synth.speak(utterance);
  });
}

export async function speakText(
  text: string,
  options: { voiceId?: string | null; rate?: number; lang?: string } = {},
): Promise<SpeakOutcome> {
  const lang = options.lang ?? 'es-MX';
  const rate = options.rate ?? 1;
  try {
    const resp = await fetch('/api/speech/speak', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, voiceId: options.voiceId ?? undefined, rate, lang }),
    });
    if (resp.status === 501) return speakWithBrowserVoice(text, lang, rate);
    if (!resp.ok) return 'failed';
    const body = (await resp.json()) as { stopped?: boolean };
    return body.stopped ? 'stopped' : 'done';
  } catch {
    return 'failed';
  }
}

/**
 * The speech as WAV audio for the app to play, so the monkey's mouth can follow
 * it. `unsupported` when this machine has no system voices (the browser speaks
 * instead); null when rendering failed.
 */
export async function renderSpeech(
  text: string,
  options: { voiceId?: string | null; rate?: number; lang?: string } = {},
): Promise<ArrayBuffer | 'unsupported' | null> {
  try {
    const resp = await fetch('/api/speech/render', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        voiceId: options.voiceId ?? undefined,
        rate: options.rate ?? 1,
        lang: options.lang ?? 'es-MX',
      }),
    });
    if (resp.status === 501) return 'unsupported';
    if (!resp.ok) return null;
    return await resp.arrayBuffer();
  } catch {
    return null;
  }
}

/** Loads the listening model now, so the first request is not the slow one. */
export async function warmUpListening(): Promise<void> {
  try {
    await fetch('/api/speech/warmup', { method: 'POST' });
  } catch {
    // Listening will just be slower the first time.
  }
}

export async function stopSpeaking(): Promise<void> {
  try {
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    await fetch('/api/speech/stop', { method: 'POST' });
  } catch {
    // Nothing to stop.
  }
}

export async function transcribeAudio(wav: ArrayBuffer, lang: string): Promise<TranscribeResult> {
  try {
    const resp = await fetch(`/api/speech/transcribe?lang=${encodeURIComponent(lang)}`, {
      method: 'POST',
      headers: { 'content-type': 'audio/wav' },
      body: wav,
    });
    if (resp.ok) {
      const body = (await resp.json()) as { text?: string };
      return { ok: true, text: typeof body.text === 'string' ? body.text : '' };
    }
    if (resp.status === 503) {
      const body = (await resp.json().catch(() => null)) as { error?: { details?: { reason?: string } } } | null;
      const reason = body?.error?.details?.reason;
      return { ok: false, code: 'stt-unavailable', ...(reason ? { reason } : {}) };
    }
    return { ok: false, code: 'stt-failed' };
  } catch {
    return { ok: false, code: 'stt-failed' };
  }
}
