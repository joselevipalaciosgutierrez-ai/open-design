import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createVoiceSession, type MicHandle, type VoiceSessionError } from '../../runtime/assistant/voice-session';
import type { MonkeyState } from '../../runtime/assistant/monkey-motion';
import { readVoicePrefs } from '../../state/assistant-prefs';
import { renderSpeech, speakText, stopSpeaking, transcribeAudio, warmUpListening } from '../../state/assistant-speech';
import { createSpeechPlayer } from '../../runtime/assistant/speech-player';
import { setAssistantLevel, setAssistantPhase, speechMouthLevel } from '../../state/assistant-voice-store';

export type VoicePhase = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking';

/**
 * What the microphone is asked for: the person's voice, clear. Noise
 * suppression, echo cancellation and level control are standard; voice
 * isolation (the browser's version of the Mac's "Voice Isolation" mic mode)
 * is asked for only where the browser knows it.
 */
export function microphoneConstraints(
  supported: Record<string, boolean | undefined> = {},
): MediaTrackConstraints {
  const audio: MediaTrackConstraints & { voiceIsolation?: boolean } = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  };
  if (supported.voiceIsolation) audio.voiceIsolation = true;
  return audio;
}

/** Opens the microphone and hands each block of samples to the session. */
async function openMicrophone(): Promise<MicHandle> {
  const supported = (navigator.mediaDevices.getSupportedConstraints?.() ?? {}) as Record<string, boolean | undefined>;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints(supported) });
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  // Cut the rumble under the voice (air conditioning, traffic, a desk being
  // knocked): nothing a person says lives below ~90 Hz.
  const lowCut = context.createBiquadFilter();
  lowCut.type = 'highpass';
  lowCut.frequency.value = 90;
  // ScriptProcessor is deprecated but works everywhere this app runs, and needs
  // no separate worklet file to ship.
  const processor = context.createScriptProcessor(4096, 1, 1);
  const mute = context.createGain();
  mute.gain.value = 0;
  let listener: ((samples: Float32Array, rate: number) => void) | null = null;
  processor.onaudioprocess = (event) => listener?.(event.inputBuffer.getChannelData(0), context.sampleRate);
  source.connect(lowCut);
  lowCut.connect(processor);
  processor.connect(mute);
  mute.connect(context.destination);
  return {
    onBlock: (cb) => { listener = cb; },
    stop: () => {
      listener = null;
      processor.disconnect();
      lowCut.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void context.close().catch(() => {});
    },
  };
}

export interface UseVoiceAssistantOptions {
  /** `es-MX`, `en-US`... for listening and speaking. */
  lang: string;
  /** What the person said, once it is text. */
  onTranscript: (text: string) => void;
  /** Something the person should be told (no microphone, nothing heard...). */
  onNotice: (notice: VoiceSessionError) => void;
  /** An agent is working on the request: the monkey thinks. */
  thinking?: boolean;
}

/**
 * The assistant's whole voice loop in one place: click to listen (it notices on
 * its own when you stop), turn it into text, and read the reply aloud. The
 * phase maps straight onto the monkey's face.
 */
export function useVoiceAssistant({ lang, onTranscript, onNotice, thinking = false }: UseVoiceAssistantOptions) {
  const [session, setSession] = useState<'idle' | 'listening' | 'transcribing'>('idle');
  const [speaking, setSpeaking] = useState(false);
  const callbacks = useRef({ onTranscript, onNotice });
  callbacks.current = { onTranscript, onNotice };

  const voice = useMemo(
    () =>
      createVoiceSession({
        openMic: openMicrophone,
        transcribe: transcribeAudio,
        lang,
        onState: setSession,
        // The person's voice moves the aura while they talk.
        onLevel: (rms) => setAssistantLevel(Math.min(1, rms * 7)),
        onTranscript: (text) => callbacks.current.onTranscript(text),
        onError: (error) => callbacks.current.onNotice(error),
      }),
    [lang],
  );

  // Plays the replies in the app, so the mouth can follow the sound.
  const player = useMemo(() => createSpeechPlayer(), []);

  useEffect(() => () => {
    voice.cancel();
    player.stop();
    void stopSpeaking();
  }, [voice, player]);

  // What is left to say, in order. Pieces arrive while the reply is still
  // being written; each one's audio is fetched as soon as it is queued, so the
  // next sentence is ready by the time the current one ends.
  const queue = useRef<Array<{ text: string; audio: Promise<ArrayBuffer | 'unsupported' | null> }>>([]);
  const draining = useRef(false);
  const stopped = useRef(false);
  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    stopped.current = false;
    setSpeaking(true);
    try {
      while (queue.current.length > 0 && !stopped.current) {
        const piece = queue.current.shift()!;
        const audio = await piece.audio;
        if (stopped.current) break;
        if (audio instanceof ArrayBuffer) {
          // Played here, so the mouth follows the sound.
          const outcome = await player.play(audio, (level) => { speechMouthLevel.current = level; });
          if (outcome === 'stopped') break;
          if (outcome === 'done') continue;
        }
        // No audio to play here: the system voice (or the browser) says it.
        const prefs = readVoicePrefs();
        const outcome = await speakText(piece.text, { voiceId: prefs.voiceId, rate: prefs.rate, lang });
        if (outcome === 'stopped') break;
      }
    } finally {
      queue.current = [];
      speechMouthLevel.current = null;
      draining.current = false;
      setSpeaking(false);
    }
  }, [lang, player]);

  /** Says one piece of the reply after whatever is already being said. */
  const speak = useCallback(
    async (piece: string) => {
      const text = piece.trim();
      const prefs = readVoicePrefs();
      if (!text || !prefs.speakReplies) return;
      queue.current.push({ text, audio: renderSpeech(text, { voiceId: prefs.voiceId, rate: prefs.rate, lang }) });
      await drain();
    },
    [drain, lang],
  );

  const stopTalking = useCallback(() => {
    stopped.current = true;
    queue.current = [];
    player.stop();
    void stopSpeaking();
    setSpeaking(false);
  }, [player]);

  /** One click: stop talking, or stop listening, or start listening. */
  const toggle = useCallback(() => {
    if (speaking) return stopTalking();
    if (session === 'listening') return voice.cancel();
    if (session === 'idle') {
      // The model loads while the person talks.
      void warmUpListening();
      void voice.start();
    }
  }, [speaking, session, voice, stopTalking]);

  const phase: VoicePhase = speaking
    ? 'speaking'
    : session === 'listening'
      ? 'listening'
      : session === 'transcribing'
        ? 'transcribing'
        : thinking
          ? 'thinking'
          : 'idle';

  // The aura around the composer reads this.
  useEffect(() => {
    setAssistantPhase(phase);
  }, [phase]);
  useEffect(() => () => setAssistantPhase('idle'), []);

  const monkeyState: MonkeyState =
    phase === 'speaking' ? 'speak'
      : phase === 'listening' ? 'listen'
        : phase === 'transcribing' || phase === 'thinking' ? 'think'
          : 'idle';

  return { phase, monkeyState, toggle, speak, stopTalking };
}
