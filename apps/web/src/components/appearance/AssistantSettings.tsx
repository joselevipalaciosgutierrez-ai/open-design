import { useEffect, useState } from 'react';
import { Button, Select } from '@open-design/components';
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
 * Settings → Lev → Voice: the voice and its speed, whether replies are read
 * aloud, and whether Lev can hear. Built from the app's own controls.
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

      <div className="settings-privacy-toggles">
      <button
        type="button"
        className={`toggle-row${prefs.speakReplies ? ' on' : ''}`}
        role="switch"
        aria-checked={prefs.speakReplies}
        data-testid="assistant-speak-replies"
        onClick={() => set({ speakReplies: !prefs.speakReplies })}
      >
        <span className="toggle-row-text">
          <span className="toggle-row-label">{copy.speakReplies}</span>
        </span>
        <span className="toggle-row-switch" aria-hidden="true" />
      </button>
      </div>

      <div className={`field ${styles.field}`}>
        <label className="field-label" htmlFor="assistant-voice">{copy.voiceTitle}</label>
        {status && !status.tts.supported ? (
          <p className="hint">{copy.voiceNone}</p>
        ) : (
          <>
            <Select
              id="assistant-voice"
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
            </Select>
            <p className="hint">{copy.voiceHint}</p>
            {!premiumFound ? <p className="hint" data-testid="assistant-voice-tip">{copy.voicePremiumTip}</p> : null}
            <Button variant="ghost" size="sm" className={styles.test} data-testid="assistant-voice-test" onClick={() => void test()} disabled={testing}>
              {copy.voiceTest}
            </Button>
          </>
        )}
      </div>

      <div className={`field ${styles.field}`}>
        <label className="field-label" htmlFor="assistant-rate">{copy.rateTitle}</label>
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

      <div className={`field ${styles.field}`}>
        <span className="field-label">{copy.listenTitle}</span>
        <p className="hint" data-testid="assistant-listen-status">
          {status?.stt.available ? copy.listenReady(status.stt.engine ?? 'whisper') : copy.listenMissing}
        </p>
      </div>
    </div>
  );
}
