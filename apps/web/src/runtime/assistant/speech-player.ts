/**
 * Plays the assistant's speech in the app and reports how loud it is, frame by
 * frame, so the monkey's mouth opens with the real sound instead of a timer.
 */
export type PlayOutcome = 'done' | 'stopped' | 'failed';

export interface SpeechPlayer {
  /** Plays one WAV; `onLevel` gets the mouth openness (0..1) every frame, then null. */
  play(wav: ArrayBuffer, onLevel: (level: number | null) => void): Promise<PlayOutcome>;
  stop(): void;
}

/** Speech RMS to mouth openness: quiet breath closed, a normal syllable wide open. */
export function mouthFromRms(rms: number): number {
  return Math.max(0, Math.min(1, (rms - 0.012) * 6));
}

export function createSpeechPlayer(): SpeechPlayer {
  let context: AudioContext | null = null;
  let current: { source: AudioBufferSourceNode; finish: (outcome: PlayOutcome) => void } | null = null;

  const audio = () => {
    if (!context) context = new AudioContext();
    return context;
  };

  return {
    async play(wav, onLevel) {
      this.stop();
      const ctx = audio();
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
      let buffer: AudioBuffer;
      try {
        buffer = await ctx.decodeAudioData(wav.slice(0));
      } catch {
        return 'failed';
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      const samples = new Float32Array(analyser.fftSize);
      let raf = 0;
      const tick = () => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i += 1) sum += samples[i]! * samples[i]!;
        onLevel(mouthFromRms(Math.sqrt(sum / samples.length)));
        raf = requestAnimationFrame(tick);
      };
      return new Promise<PlayOutcome>((resolve) => {
        let settled = false;
        const finish = (outcome: PlayOutcome) => {
          if (settled) return;
          settled = true;
          cancelAnimationFrame(raf);
          onLevel(null);
          source.disconnect();
          analyser.disconnect();
          if (current?.source === source) current = null;
          resolve(outcome);
        };
        current = { source, finish };
        source.onended = () => finish('done');
        source.start();
        raf = requestAnimationFrame(tick);
      });
    },
    stop() {
      const playing = current;
      current = null;
      if (!playing) return;
      try {
        playing.source.stop();
      } catch {
        // Already ended.
      }
      playing.finish('stopped');
    },
  };
}
