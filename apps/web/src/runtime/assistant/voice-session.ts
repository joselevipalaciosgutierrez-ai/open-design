import { createEndpointer, type EndpointOptions } from './endpointing';
import { concatChunks, encodeWav, resampleTo16k, rmsLevel, WAV_RATE } from './wav';

/**
 * One spoken request: open the microphone, listen until the person stops
 * talking, turn the audio into text. Nothing here knows about the DOM or the
 * network; the microphone and the transcriber are handed in, so the whole
 * sequence (including every way it can go wrong) is testable.
 */

export interface MicHandle {
  /** Called with each block of samples. */
  onBlock: (cb: (samples: Float32Array, sampleRate: number) => void) => void;
  stop: () => void;
}

export type TranscribeResult =
  | { ok: true; text: string }
  | { ok: false; code: 'stt-unavailable' | 'stt-failed'; reason?: string };

export type VoiceSessionError =
  | { code: 'mic-denied' }
  | { code: 'no-speech' }
  | { code: 'stt-unavailable'; reason?: string }
  | { code: 'stt-failed' };

export type VoiceSessionState = 'idle' | 'listening' | 'transcribing';

export interface VoiceSessionDeps {
  openMic: () => Promise<MicHandle>;
  transcribe: (wav: ArrayBuffer, lang: string) => Promise<TranscribeResult>;
  lang: string;
  onState: (state: VoiceSessionState) => void;
  onTranscript: (text: string) => void;
  onError: (error: VoiceSessionError) => void;
  /** Told when speech starts, e.g. to widen the monkey's eyes. */
  onSpeechStart?: () => void;
  /** The microphone level (RMS, 0..1) of every block, to make the aura move with the person's voice. */
  onLevel?: (rms: number) => void;
  now?: () => number;
  endpoint?: EndpointOptions;
}

export function createVoiceSession(deps: VoiceSessionDeps) {
  const now = deps.now ?? (() => performance.now());
  let state: VoiceSessionState = 'idle';
  let mic: MicHandle | null = null;
  let generation = 0;

  const setState = (next: VoiceSessionState) => {
    state = next;
    deps.onState(next);
  };

  function release() {
    mic?.stop();
    mic = null;
  }

  async function finish(id: number, chunks: Float32Array[], rate: number) {
    release();
    if (id !== generation) return;
    setState('transcribing');
    const samples = resampleTo16k(concatChunks(chunks), rate);
    const wav = encodeWav(samples, rate < WAV_RATE ? rate : WAV_RATE);
    const result = await deps.transcribe(wav, deps.lang);
    if (id !== generation) return;
    setState('idle');
    if (!result.ok) {
      deps.onError(result.code === 'stt-unavailable'
        ? { code: 'stt-unavailable', ...(result.reason ? { reason: result.reason } : {}) }
        : { code: 'stt-failed' });
      return;
    }
    const text = result.text.trim();
    if (!text) {
      deps.onError({ code: 'no-speech' });
      return;
    }
    deps.onTranscript(text);
  }

  return {
    state: () => state,

    async start(): Promise<void> {
      if (state !== 'idle') return;
      const id = ++generation;
      let handle: MicHandle;
      try {
        handle = await deps.openMic();
      } catch {
        if (id === generation) deps.onError({ code: 'mic-denied' });
        return;
      }
      if (id !== generation) {
        handle.stop();
        return;
      }
      mic = handle;
      // 14 s is what the fast listening engine hears whole; a spoken request
      // rarely runs longer, and past it the answer would come back slowly.
      const endpointer = createEndpointer({ maxMs: 14000, ...deps.endpoint });
      const chunks: Float32Array[] = [];
      let rate = WAV_RATE;
      let done = false;
      setState('listening');
      handle.onBlock((samples, sampleRate) => {
        if (done || id !== generation) return;
        rate = sampleRate;
        chunks.push(new Float32Array(samples));
        const level = rmsLevel(samples);
        deps.onLevel?.(level);
        const event = endpointer.push(level, now());
        if (!event) return;
        if (event.type === 'speech-start') {
          deps.onSpeechStart?.();
          return;
        }
        done = true;
        if (event.type === 'timeout') {
          release();
          setState('idle');
          deps.onError({ code: 'no-speech' });
          return;
        }
        void finish(id, chunks, rate);
      });
    },

    /** Stops listening without sending anything. */
    cancel(): void {
      generation += 1;
      release();
      if (state !== 'idle') setState('idle');
    },
  };
}

export type VoiceSession = ReturnType<typeof createVoiceSession>;
