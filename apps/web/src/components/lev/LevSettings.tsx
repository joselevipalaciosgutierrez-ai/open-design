import { useEffect, useState } from 'react';
import type { AppConfigPrefs } from '@open-design/contracts';
import { useI18n } from '../../i18n';
import { AssistantSettings } from '../appearance/AssistantSettings';
import { LessonsSettings } from '../appearance/LessonsSettings';

const COPY = {
  es: {
    islandTitle: 'Lev Island',
    islandLabel: 'Mostrar a Lev en el notch',
    islandHint: 'El mono vive junto a la cámara cuando usas otras apps: haz clic para hablarle o escríbele. Se aparta al volver a Lev Design. Solo en Mac.',
  },
  en: {
    islandTitle: 'Lev Island',
    islandLabel: 'Show Lev on the notch',
    islandHint: 'The monkey sits by the camera while you use other apps: click to talk, or write to it. It steps aside when you come back to Lev Design. Mac only.',
  },
};

/**
 * Settings → Lev: everything about the orchestrator in one place. The island,
 * how it sounds and hears, and what it has learned.
 */
export function LevSettings() {
  const { locale } = useI18n();
  const es = locale.toLowerCase().startsWith('es');
  const copy = es ? COPY.es : COPY.en;
  const lang = es ? 'es-MX' : 'en-US';
  // Read and written straight on the daemon (the desktop app watches it to
  // start or stop the island), not through the browser-side settings copy.
  const [islandOn, setIslandOn] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetch('/api/app-config')
      .then((resp) => (resp.ok ? (resp.json() as Promise<{ config?: AppConfigPrefs }>) : null))
      .then((body) => {
        if (alive && body?.config) setIslandOn(body.config.levIsland === true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const toggleIsland = () => {
    const next = !islandOn;
    setIslandOn(next);
    void fetch('/api/app-config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ levIsland: next }),
    }).then((resp) => {
      if (!resp.ok) setIslandOn(!next);
    }).catch(() => setIslandOn(!next));
  };

  return (
    <section className="settings-section settings-general-section" data-testid="settings-lev-section">
      <div className="settings-general-block">
        <div className="settings-general-block-head">
          <h3>{copy.islandTitle}</h3>
        </div>
        <div className="settings-privacy-toggles">
        <button
          type="button"
          className={`toggle-row${islandOn ? ' on' : ''}`}
          role="switch"
          aria-checked={islandOn}
          data-testid="settings-lev-island"
          onClick={toggleIsland}
        >
          <span className="toggle-row-text">
            <span className="toggle-row-label">{copy.islandLabel}</span>
            <span className="toggle-row-hint">{copy.islandHint}</span>
          </span>
          <span className="toggle-row-switch" aria-hidden="true" />
        </button>
        </div>
      </div>

      <div className="settings-general-block">
        <AssistantSettings lang={lang} />
      </div>

      <div className="settings-general-block">
        <LessonsSettings />
      </div>
    </section>
  );
}
