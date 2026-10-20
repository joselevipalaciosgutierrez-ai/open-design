import { describe, expect, it, vi } from 'vitest';
import {
  createVoiceSession,
  type MicHandle,
  type TranscribeResult,
  type VoiceSessionError,
} from '../../src/runtime/assistant/voice-session';

function harness(transcribe: (wav: ArrayBuffer, lang: string) => Promise<TranscribeResult>) {
  let push: (samples: Float32Array, rate: number) => void = () => {};
  let clock = 0;
  const stopped = { n: 0 };
  const events: string[] = [];
  const transcripts: string[] = [];
  const errors: VoiceSessionError[] = [];
  const mic: MicHandle = {
    onBlock: (cb) => { push = cb; },
    stop: () => { stopped.n += 1; },
  };
  const session = createVoiceSession({
    openMic: async () => mic,
    transcribe,
    lang: 'es-MX',
    onState: (s) => events.push(s),
    onTranscript: (t) => transcripts.push(t),
    onError: (e) => errors.push(e),
    onSpeechStart: () => events.push('speech-start'),
    now: () => clock,
  });
  /** One 50 ms block at the given level. */
  const block = (level: number) => {
    clock += 50;
    push(new Float32Array(800).fill(level), 16000);
  };
  const blocks = (level: number, n: number) => { for (let i = 0; i < n; i += 1) block(level); };
  return { session, block, blocks, events, transcripts, errors, stopped };
}

describe('createVoiceSession', () => {
  it('listens, hears the request end by itself and sends the text', async () => {
    const transcribe = vi.fn(async (_wav: ArrayBuffer, _lang: string) => ({ ok: true as const, text: ' Crea una landing ' }));
    const h = harness(transcribe);
    await h.session.start();
    expect(h.session.state()).toBe('listening');
    h.blocks(0.004, 10);
    h.blocks(0.12, 20);
    h.blocks(0.004, 30);
    await new Promise((r) => setTimeout(r, 0));
    expect(transcribe).toHaveBeenCalledTimes(1);
    const [wav, lang] = transcribe.mock.calls[0]!;
    expect(wav.byteLength).toBeGreaterThan(44);
    expect(lang).toBe('es-MX');
    expect(h.transcripts).toEqual(['Crea una landing']);
    expect(h.events).toEqual(['listening', 'speech-start', 'transcribing', 'idle']);
    expect(h.stopped.n).toBe(1);
  });

  it('reports the microphone level of every block while listening, and stops after', async () => {
    const levels: number[] = [];
    let push: (samples: Float32Array, rate: number) => void = () => {};
    const session = createVoiceSession({
      openMic: async () => ({ onBlock: (cb) => { push = cb; }, stop: () => {} }),
      transcribe: async () => ({ ok: true, text: 'x' }),
      lang: 'es',
      onState: () => {}, onTranscript: () => {}, onError: () => {},
      onLevel: (rms) => levels.push(rms),
      now: (() => { let t = 0; return () => (t += 50); })(),
    });
    await session.start();
    push(new Float32Array(400).fill(0.5), 16000);
    push(new Float32Array(400).fill(0.1), 16000);
    expect(levels[0]).toBeCloseTo(0.5, 5);
    expect(levels[1]).toBeCloseTo(0.1, 5);
    session.cancel();
    push(new Float32Array(400).fill(0.9), 16000);
    expect(levels).toHaveLength(2);
  });

  it('reports no speech when nobody says anything', async () => {
    const h = harness(async () => ({ ok: true, text: 'x' }));
    await h.session.start();
    h.blocks(0.004, 200);
    expect(h.errors).toEqual([{ code: 'no-speech' }]);
    expect(h.session.state()).toBe('idle');
    expect(h.stopped.n).toBe(1);
  });

  it('reports no speech when the transcript is empty', async () => {
    const h = harness(async () => ({ ok: true, text: '  ' }));
    await h.session.start();
    h.blocks(0.004, 10); h.blocks(0.12, 20); h.blocks(0.004, 30);
    await new Promise((r) => setTimeout(r, 0));
    expect(h.errors).toEqual([{ code: 'no-speech' }]);
    expect(h.transcripts).toEqual([]);
  });

  it('passes on why listening is not set up', async () => {
    const h = harness(async () => ({ ok: false, code: 'stt-unavailable', reason: 'binary-missing' }));
    await h.session.start();
    h.blocks(0.004, 10); h.blocks(0.12, 20); h.blocks(0.004, 30);
    await new Promise((r) => setTimeout(r, 0));
    expect(h.errors).toEqual([{ code: 'stt-unavailable', reason: 'binary-missing' }]);
    expect(h.session.state()).toBe('idle');
  });

  it('reports a denied microphone', async () => {
    const errors: VoiceSessionError[] = [];
    const session = createVoiceSession({
      openMic: async () => { throw new Error('denied'); },
      transcribe: async () => ({ ok: true, text: 'x' }),
      lang: 'es',
      onState: () => {}, onTranscript: () => {}, onError: (e) => errors.push(e),
    });
    await session.start();
    expect(errors).toEqual([{ code: 'mic-denied' }]);
    expect(session.state()).toBe('idle');
  });

  it('cancel stops the microphone and sends nothing, even if the audio was already ending', async () => {
    const transcribe = vi.fn(async (_wav: ArrayBuffer, _lang: string) => ({ ok: true as const, text: 'hola' }));
    const h = harness(transcribe);
    await h.session.start();
    h.blocks(0.004, 10); h.blocks(0.12, 20);
    h.session.cancel();
    h.blocks(0.004, 30);
    await new Promise((r) => setTimeout(r, 0));
    expect(transcribe).not.toHaveBeenCalled();
    expect(h.stopped.n).toBeGreaterThanOrEqual(1);
    expect(h.session.state()).toBe('idle');
  });

  it('ignores a second start while listening', async () => {
    const h = harness(async () => ({ ok: true, text: 'x' }));
    await h.session.start();
    await h.session.start();
    expect(h.events.filter((e) => e === 'listening')).toHaveLength(1);
  });

  it('drops a transcript that arrives after cancel', async () => {
    let resolve: (r: TranscribeResult) => void = () => {};
    const h = harness(() => new Promise((r) => { resolve = r; }));
    await h.session.start();
    h.blocks(0.004, 10); h.blocks(0.12, 20); h.blocks(0.004, 30);
    expect(h.session.state()).toBe('transcribing');
    h.session.cancel();
    resolve({ ok: true, text: 'tarde' });
    await new Promise((r) => setTimeout(r, 0));
    expect(h.transcripts).toEqual([]);
  });
});
