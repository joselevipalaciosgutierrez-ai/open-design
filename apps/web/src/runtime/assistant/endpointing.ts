/**
 * Decides when the person has finished talking, so one click is enough: no
 * second click to say "I'm done". Fed the microphone level (RMS, 0..1) a few
 * times per second, it learns the room's noise from the first moments, notes
 * when speech starts, and calls the end after a short silence.
 */

export type EndpointEvent =
  | { type: 'speech-start' }
  | { type: 'end'; reason: 'silence' | 'max-length'; speechMs: number }
  | { type: 'timeout' };

export interface EndpointOptions {
  /** Silence that ends a sentence, after speech. */
  endSilenceMs?: number;
  /** Give up when nobody speaks. */
  noSpeechTimeoutMs?: number;
  /** Never listen longer than this. */
  maxMs?: number;
  /** Speech shorter than this is a click or a cough, not a request. */
  minSpeechMs?: number;
  /** Time spent measuring the room before judging. */
  calibrationMs?: number;
}

const DEFAULTS: Required<EndpointOptions> = {
  endSilenceMs: 1100,
  noSpeechTimeoutMs: 7000,
  maxMs: 30000,
  minSpeechMs: 300,
  calibrationMs: 350,
};

export function createEndpointer(options: EndpointOptions = {}) {
  const o = { ...DEFAULTS, ...options };
  let startedAt: number | null = null;
  let floor = 0;
  let floorSamples = 0;
  let speechStartedAt: number | null = null;
  let lastVoiceAt = 0;
  let finished = false;

  return {
    /** Feeds one level; returns an event when something happened. */
    push(level: number, now: number): EndpointEvent | null {
      if (finished) return null;
      if (startedAt === null) startedAt = now;
      const elapsed = now - startedAt;

      if (elapsed < o.calibrationMs) {
        floor = (floor * floorSamples + level) / (floorSamples + 1);
        floorSamples += 1;
        return null;
      }

      const speechLevel = Math.max(0.02, floor * 3.2);
      const silenceLevel = Math.max(0.012, floor * 1.8);
      const voiced = level >= (speechStartedAt === null ? speechLevel : silenceLevel);

      if (elapsed >= o.maxMs) {
        finished = true;
        return speechStartedAt === null
          ? { type: 'timeout' }
          : { type: 'end', reason: 'max-length', speechMs: now - speechStartedAt };
      }

      if (speechStartedAt === null) {
        if (voiced) {
          speechStartedAt = now;
          lastVoiceAt = now;
          return { type: 'speech-start' };
        }
        if (elapsed >= o.noSpeechTimeoutMs) {
          finished = true;
          return { type: 'timeout' };
        }
        return null;
      }

      if (voiced) {
        lastVoiceAt = now;
        return null;
      }
      const spoke = lastVoiceAt - speechStartedAt;
      if (now - lastVoiceAt >= o.endSilenceMs) {
        if (spoke < o.minSpeechMs) {
          // Too short to be a request: forget it and keep listening.
          speechStartedAt = null;
          return null;
        }
        finished = true;
        return { type: 'end', reason: 'silence', speechMs: spoke };
      }
      return null;
    },
    /** The noise floor measured so far (for tests and tuning). */
    noiseFloor: () => floor,
  };
}
