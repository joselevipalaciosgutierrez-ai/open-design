import type { AppTheme } from '../../types';
import { useAppearanceCopy } from './use-appearance-copy';
import styles from './AppearanceSection.module.css';

export interface AppearanceSectionProps {
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
}

const OPTIONS: ReadonlyArray<AppTheme> = ['system', 'light', 'dark'];

/**
 * Settings → Appearance. Today it holds the theme; later appearance settings
 * (density, fonts, accent) are further blocks in the same section.
 */
export function AppearanceSection({ theme, onThemeChange }: AppearanceSectionProps) {
  const copy = useAppearanceCopy();
  const label = (value: AppTheme) =>
    value === 'light' ? copy.light : value === 'dark' ? copy.dark : copy.system;

  return (
    <section
      className="settings-section settings-general-section"
      data-testid="settings-appearance-section"
    >
      <div className="settings-general-block">
        <div className="settings-general-block-head">
          <h3>{copy.themeTitle}</h3>
          <p className="hint">{copy.themeHint}</p>
        </div>
        <div className={styles.options} role="radiogroup" aria-label={copy.themeTitle}>
          {OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              className={`${styles.option}${theme === value ? ` ${styles.selected}` : ''}`}
              data-testid={`appearance-theme-${value}`}
              onClick={() => {
                if (value !== theme) onThemeChange(value);
              }}
            >
              <span className={`${styles.preview} ${styles[`preview_${value}`]}`} aria-hidden="true">
                <span className={styles.previewBar} />
                <span className={styles.previewBody}>
                  <span className={styles.previewSide} />
                  <span className={styles.previewMain}>
                    <span className={styles.previewLine} />
                    <span className={styles.previewLineShort} />
                  </span>
                </span>
              </span>
              <span className={styles.name}>{label(value)}</span>
              {value === 'system' ? <span className={styles.hint}>{copy.systemHint}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
