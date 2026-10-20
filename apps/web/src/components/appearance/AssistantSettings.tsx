import { useEffect, useState } from 'react';
import { useVoicePrefs, writeVoicePrefs } from '../../state/assistant-prefs';
import {
  fetchSpeechStatus,
  fetchSpeechVoices,
  speakText,
  stopSpeaking,
  type SpeechStatus,
  type SpeechVoiceInfo,
} from '../../state/assistant-speech';
import { useAppearanceCopy } from './use-appearance-copy';
import styles from './AssistantSettings.module.css';

const QUALITY_LABEL: Record<SpeechVoiceInfo['quality'], string> = {
  premium: 'Premium',
  enhanced: 'Enhanced',
  standard: '',
};

/** Voices that speak the app's language first, then the rest. */
function sortVoices(voices: readonly SpeechVoiceInfo[], lang: string): SpeechVoiceInfo[] {
  const primary = lang.toLowerCase().slice(0, 2);
  return [...voices].sort((a, b) => {
    const am = a.lang.toLowerCase().startsWith(primary) ? 0 : 1;
    const bm = b.lang.toLowerCase().startsWith(primary) ? 0 : 1;
    return am - bm;
  });
}

/**
 * Settings → Appearance → Assistant: the voice and its
 * speed, whether replies are read aloud, and whether the assistant can hear.
 */
export function AssistantSettings({ lang }: { lang: string }) {
  const copy = useAppearanceCopy();
  const prefs = useVoicePrefs();
  const [voices, setVoices] = useState<SpeechVoiceInfo[]>([]);
  const [status, setStatus] = useState<SpeechStatus | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchSpeechVoices().then((v) => {
      if (!cancelled) setVoices(v);
    });
    void fetchSpeechStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
      void stopSpeaking();
    };
  }, []);

  const set = (patch: Partial<typeof prefs>) => writeVoicePrefs({ ...prefs, ...patch });
  const shown = sortVoices(voices, lang);
  const premiumFound = voices.some((v) => v.quality !== 'standard');

  const test = async () => {
    if (testing) return;
    setTesting(true);
    try {
      await speakText(copy.voiceTestSample, { voiceId: prefs.voiceId, rate: prefs.rate, lang });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className={styles.block} data-testid="assistant-settings">
      <div className="settings-general-block-head">
        <h3>{copy.assistantTitle}</h3>
        <p className="hint">{copy.assistantHint}</p>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="assistant-voice">{copy.voiceTitle}</label>
        {status && !status.tts.supported ? (
          <p className={styles.hint}>{copy.voiceNone}</p>
        ) : (
          <>
            <select
              id="assistant-voice"
              className={styles.select}
              data-testid="assistant-voice-select"
              value={prefs.voiceId ?? ''}
              onChange={(e) => set({ voiceId: e.target.value || null })}
            >
              <option value="">{copy.voiceAuto}</option>
              {shown.map((v) => (
                <option key={`${v.id}|${v.lang}`} value={v.id}>
                  {[v.name, v.lang, QUALITY_LABEL[v.quality]].filter(Boolean).join(' · ')}
                </option>
              ))}
            </select>
            <p className={styles.hint}>{copy.voiceHint}</p>
            {!premiumFound ? <p className={styles.hint} data-testid="assistant-voice-tip">{copy.voicePremiumTip}</p> : null}
            <button type="button" className={styles.test} data-testid="assistant-voice-test" onClick={() => void test()} disabled={testing}>
              {copy.voiceTest}
            </button>
          </>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="assistant-rate">{copy.rateTitle}</label>
        <div className={styles.row}>
          <input
            id="assistant-rate"
            className={styles.range}
            type="range"
            min={0.7}
            max={1.4}
            step={0.05}
            value={prefs.rate}
            data-testid="assistant-rate"
            onChange={(e) => set({ rate: Number(e.target.value) })}
          />
          <span className={styles.value}>{`${Math.round(prefs.rate * 100)} %`}</span>
        </div>
      </div>

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={prefs.speakReplies}
          data-testid="assistant-speak-replies"
          onChange={(e) => set({ speakReplies: e.target.checked })}
        />
        <span>{copy.speakReplies}</span>
      </label>

      <div className={styles.field}>
        <span className={styles.label}>{copy.listenTitle}</span>
        <p className={styles.status} data-testid="assistant-listen-status">
          {status?.stt.available ? copy.listenReady(status.stt.engine ?? 'whisper') : copy.listenMissing}
        </p>
      </div>
    </div>
  );
}
