import { useCallback, useState } from 'react';
import { Button, Input } from '@open-design/components';
import type { AppConfigTuningKey, AppConfigTuningResponse, AppConfigTuningSetting } from '@open-design/contracts';

import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import {
  fetchAppConfigTuning,
  restoreAppConfigTuningDefault,
  saveAppConfigTuningValue,
} from '../state/app-config-tuning';
import styles from './PerformanceSettings.module.css';

const TEXT: Record<AppConfigTuningKey, { label: keyof Dict; description: keyof Dict }> = {
  antigravityWarmMax: {
    label: 'settings.tuning.antigravityWarmMax.label',
    description: 'settings.tuning.antigravityWarmMax.description',
  },
  antigravityWarmIdleSeconds: {
    label: 'settings.tuning.antigravityWarmIdleSeconds.label',
    description: 'settings.tuning.antigravityWarmIdleSeconds.description',
  },
};

const UNIT_TEXT: Record<AppConfigTuningSetting['unit'], keyof Dict> = {
  processes: 'settings.tuningUnitProcesses',
  seconds: 'settings.tuningUnitSeconds',
};

type Loaded = { state: 'idle' } | { state: 'error' } | { state: 'ready'; data: AppConfigTuningResponse };

/**
 * Settings → environment → local CLI: how much memory the CLI the daemon starts may
 * hold while it waits. It reads the values from the daemon (the default for the
 * process limit depends on the machine's memory), writes one key at a time and
 * restores a default by removing the stored value. Folded, and silent until opened.
 */
export function PerformanceSettings() {
  const t = useT();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'idle' });
  const [started, setStarted] = useState(false);

  const load = useCallback(async () => {
    const data = await fetchAppConfigTuning();
    setLoaded(data ? { state: 'ready', data } : { state: 'error' });
  }, []);

  return (
    <details
      className="agent-cli-env"
      data-testid="settings-performance"
      onToggle={(event) => {
        if (event.currentTarget.open && !started) {
          setStarted(true);
          void load();
        }
      }}
    >
      <summary className="agent-cli-env-summary">
        <span className="agent-cli-env-summary-title">{t('settings.performanceTitle')}</span>
      </summary>
      <div className="agent-cli-env-body">
        <p className="hint">{t('settings.performanceHint')}</p>
        {loaded.state === 'error' ? (
          <p className={styles.error} data-testid="tuning-load-error">
            {t('settings.tuningLoadError')}
          </p>
        ) : null}
        {loaded.state === 'ready' ? (
          <div className={styles.rows}>
            {loaded.data.settings.map((setting) => (
              <TuningRow key={setting.key} setting={setting} memoryGb={loaded.data.memoryGb} onChanged={load} />
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function TuningRow({
  setting,
  memoryGb,
  onChanged,
}: {
  setting: AppConfigTuningSetting;
  memoryGb: number;
  onChanged: () => Promise<void>;
}) {
  const t = useT();
  const [draft, setDraft] = useState(String(setting.effective));
  const [lastEffective, setLastEffective] = useState(setting.effective);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  // The daemon is the source of truth: when it reports another value, show that one.
  if (setting.effective !== lastEffective) {
    setLastEffective(setting.effective);
    setDraft(String(setting.effective));
    setError(false);
  }

  const commit = async () => {
    if (busy || draft.trim() === String(setting.effective)) return;
    const typed = Number(draft);
    const valid = draft.trim() !== '' && Number.isInteger(typed) && typed >= setting.min && typed <= setting.max;
    if (!valid) {
      setError(true);
      return;
    }
    setError(false);
    setBusy(true);
    const saved = await saveAppConfigTuningValue(setting.key, typed);
    if (saved) await onChanged();
    else setError(true);
    setBusy(false);
  };

  const restore = async () => {
    setBusy(true);
    setError(false);
    if (await restoreAppConfigTuningDefault(setting.key)) await onChanged();
    else setError(true);
    setBusy(false);
  };

  const text = TEXT[setting.key];
  const defaultText =
    setting.key === 'antigravityWarmMax'
      ? t('settings.tuningDefaultFromMemory', { value: setting.default, gb: memoryGb })
      : t('settings.tuningDefault', { value: setting.default });

  return (
    <div className={styles.row}>
      <span className={styles.label}>{t(text.label)}</span>
      <p className={styles.description}>{t(text.description)}</p>
      <div className={styles.control}>
        <Input
          className={styles.input}
          type="number"
          inputMode="numeric"
          min={setting.min}
          max={setting.max}
          step={1}
          value={draft}
          disabled={busy}
          aria-label={t(text.label)}
          data-testid={`tuning-input-${setting.key}`}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(false);
          }}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void commit();
          }}
        />
        <span className={styles.unit}>{t(UNIT_TEXT[setting.unit])}</span>
      </div>
      <div className={styles.meta}>
        <span data-testid={`tuning-default-${setting.key}`}>{defaultText}</span>
        <span>{t('settings.tuningRange', { min: setting.min, max: setting.max })}</span>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || setting.value === null}
          data-testid={`tuning-restore-${setting.key}`}
          onClick={() => void restore()}
        >
          {t('settings.tuningRestore')}
        </Button>
      </div>
      {error ? (
        <p className={styles.error} data-testid={`tuning-error-${setting.key}`} role="alert">
          {t('settings.tuningSaveError', { min: setting.min, max: setting.max })}
        </p>
      ) : null}
    </div>
  );
}
