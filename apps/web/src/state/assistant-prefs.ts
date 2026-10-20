/** What the user chose for the assistant's voice. Per device, kept in the browser. */

import { useSyncExternalStore } from 'react';
import {
  DEFAULT_AURA_COLOR,
  DEFAULT_AURA_PRESET,
  normalizeAuraColor,
  normalizeAuraPreset,
  type AuraPresetId,
} from '../runtime/assistant/aura-colors';

export interface AssistantVoicePrefs {
  /** Read replies aloud after a spoken request. */
  speakReplies: boolean;
  /** A voice id from `/api/speech/voices`; null lets the daemon pick the best. */
  voiceId: string | null;
  /** 0.7 to 1.4 around a calm 175 words per minute. */
  rate: number;
  /** Which colours the aura around the monkey wears, or `custom` to use `auraColor`. */
  auraPreset: AuraPresetId | 'custom';
  /** The colour used when `auraPreset` is `custom`. */
  auraColor: string;
}

export const DEFAULT_VOICE_PREFS: AssistantVoicePrefs = {
  speakReplies: true,
  voiceId: null,
  rate: 1,
  auraPreset: DEFAULT_AURA_PRESET,
  auraColor: DEFAULT_AURA_COLOR,
};

const KEY = 'od:assistant-voice';

export function readVoicePrefs(): AssistantVoicePrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_VOICE_PREFS;
    const parsed = JSON.parse(raw) as Partial<AssistantVoicePrefs>;
    const rate = typeof parsed.rate === 'number' && Number.isFinite(parsed.rate) ? parsed.rate : 1;
    return {
      speakReplies: parsed.speakReplies !== false,
      voiceId: typeof parsed.voiceId === 'string' && parsed.voiceId ? parsed.voiceId : null,
      rate: Math.max(0.7, Math.min(1.4, rate)),
      auraPreset: normalizeAuraPreset(parsed.auraPreset),
      auraColor: normalizeAuraColor(parsed.auraColor) ?? DEFAULT_AURA_COLOR,
    };
  } catch {
    return DEFAULT_VOICE_PREFS;
  }
}

const listeners = new Set<() => void>();
let snapshot: AssistantVoicePrefs | null = null;

function notify(): void {
  snapshot = null;
  listeners.forEach((l) => l());
}

export function writeVoicePrefs(prefs: AssistantVoicePrefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // The choice just won't be remembered.
  }
  notify();
}

function getSnapshot(): AssistantVoicePrefs {
  if (!snapshot) snapshot = readVoicePrefs();
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) notify();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** The prefs, live: a change in Settings reaches the monkey and the aura at once. */
export function useVoicePrefs(): AssistantVoicePrefs {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_VOICE_PREFS);
}
