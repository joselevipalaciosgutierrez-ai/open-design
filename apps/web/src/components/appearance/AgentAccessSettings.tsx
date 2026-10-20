import { useCallback, useEffect, useState } from 'react';
import { Button, Input } from '@open-design/components';
import type { AgentAccessResponse, AgentAccessSettings as Access, MacControlStatus } from '@open-design/contracts';
import { useI18n } from '../../i18n';
import styles from './AgentAccessSettings.module.css';

interface Copy {
  title: string;
  hint: string;
  notEnforced: string;
  foldersTitle: string;
  foldersHint: string;
  onlyProject: string;
  addPlaceholder: string;
  add: string;
  remove: string;
  refused: (path: string, reason: string) => string;
  readAll: string;
  readAllHint: string;
  macControl: string;
  macControlHint: string;
  accessibilityOn: string;
  accessibilityOff: string;
  rulesTitle: string;
  rules: string[];
  loadFailed: string;
}

const ES: Copy = {
  title: 'Acceso del asistente',
  hint: 'Lo que los agentes pueden tocar en tu Mac. Lo impone el sistema (un sandbox de macOS alrededor de cada agente), no una instrucción: un agente no puede saltárselo ni cambiarlo.',
  notEnforced: 'En este equipo los límites no se aplican (solo funcionan en macOS).',
  foldersTitle: 'Dónde pueden escribir',
  foldersHint: 'Siempre en la carpeta del proyecto. Añade otras solo si quieres que trabajen ahí. No se pueden dar el disco entero, tu carpeta personal completa ni carpetas del sistema.',
  onlyProject: 'Solo en la carpeta del proyecto.',
  addPlaceholder: '/Users/tú/Proyectos/mi-app',
  add: 'Añadir carpeta',
  remove: 'Quitar',
  refused: (path, reason) => `No se añadió ${path}: ${reason}.`,
  readAll: 'Pueden leer toda tu Mac',
  readAllHint: 'Escritorio, Documentos, Descargas… Tus claves SSH y de la nube, los datos y contraseñas del navegador, el correo y los mensajes nunca son legibles.',
  macControl: 'Control de la Mac',
  macControlHint: 'Abrir apps y páginas, escribir, pulsar teclas, hacer clic y ver la pantalla. Nunca dentro de terminales, Ajustes del Sistema ni llaveros.',
  accessibilityOn: 'macOS lo permite (Accesibilidad activada).',
  accessibilityOff: 'Falta permiso: Ajustes del Sistema → Privacidad y seguridad → Accesibilidad, y activa esta app. Para ver la pantalla, también Grabación de pantalla.',
  rulesTitle: 'Lo que siempre preguntan antes',
  rules: [
    'Borrar o sobrescribir tu trabajo',
    'Enviar mensajes, correos o publicaciones',
    'Comprar algo',
    'Instalar programas',
    'Cambiar ajustes de la Mac',
    'Publicar',
  ],
  loadFailed: 'No se pudo leer el acceso del asistente.',
};

const EN: Copy = {
  title: 'Assistant access',
  hint: 'What the agents may touch on your Mac. The system enforces it (a macOS sandbox around every agent), not an instruction: an agent cannot get around it or change it.',
  notEnforced: 'Limits are not enforced on this machine (macOS only).',
  foldersTitle: 'Where they may write',
  foldersHint: 'Always the project folder. Add others only if you want them to work there. The whole disk, your entire home folder and system folders cannot be given.',
  onlyProject: 'Only the project folder.',
  addPlaceholder: '/Users/you/Projects/my-app',
  add: 'Add folder',
  remove: 'Remove',
  refused: (path, reason) => `${path} was not added: ${reason}.`,
  readAll: 'They may read your whole Mac',
  readAllHint: 'Desktop, Documents, Downloads… Your SSH and cloud keys, browser data and passwords, mail and messages are never readable.',
  macControl: 'Mac control',
  macControlHint: 'Open apps and pages, type, press keys, click and see the screen. Never inside terminals, System Settings or keychains.',
  accessibilityOn: 'macOS allows it (Accessibility on).',
  accessibilityOff: 'Permission missing: System Settings → Privacy & Security → Accessibility, and turn this app on. To see the screen, Screen Recording too.',
  rulesTitle: 'What they always ask about first',
  rules: ['Deleting or overwriting your work', 'Sending messages, email or posts', 'Buying anything', 'Installing software', 'Changing Mac settings', 'Publishing'],
  loadFailed: 'The assistant access could not be read.',
};

/** Settings → Privacy → Assistant access: folders, reading, Mac control. */
export function AgentAccessSettings() {
  const { locale } = useI18n();
  const copy = locale.toLowerCase().startsWith('es') ? ES : EN;
  const [state, setState] = useState<AgentAccessResponse | null>(null);
  const [mac, setMac] = useState<MacControlStatus | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadMac = useCallback(async () => {
    try {
      const resp = await fetch('/api/mac/status');
      if (resp.ok) setMac((await resp.json()) as MacControlStatus);
    } catch {
      // Status stays unknown.
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const resp = await fetch('/api/agent-access');
        if (!resp.ok) throw new Error(String(resp.status));
        const body = (await resp.json()) as AgentAccessResponse;
        if (alive) setState(body);
      } catch {
        if (alive) setError(copy.loadFailed);
      }
    })();
    void loadMac();
    return () => {
      alive = false;
    };
  }, [copy.loadFailed, loadMac]);

  const save = async (patch: Partial<Access>) => {
    try {
      const resp = await fetch('/api/agent-access', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!resp.ok) throw new Error(String(resp.status));
      const body = (await resp.json()) as AgentAccessResponse;
      setState(body);
      const refused = body.refused?.[0];
      setError(refused ? copy.refused(refused.path, refused.reason) : null);
      if (patch.macControl !== undefined) void loadMac();
    } catch {
      setError(copy.loadFailed);
    }
  };

  const access = state?.access;
  const toggle = (on: boolean, label: string, hint: string, testId: string, onClick: () => void, extra?: string | null) => (
    <button
      type="button"
      className={`toggle-row${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      data-testid={testId}
      onClick={onClick}
    >
      <span className="toggle-row-text">
        <span className="toggle-row-label">{label}</span>
        <span className="toggle-row-hint">{hint}</span>
        {extra ? <span className="toggle-row-hint" data-testid="agent-access-accessibility">{extra}</span> : null}
      </span>
      <span className="toggle-row-switch" aria-hidden="true" />
    </button>
  );

  // Laid out like the rest of Settings: subsections with a section head, switch rows, fields.
  return (
    <div className={styles.root} data-testid="agent-access-settings">
      <div className="settings-general-block-head">
        <h3>{copy.title}</h3>
        <p className="hint">{copy.hint}</p>
        {state && !state.enforced ? <p className="hint" data-testid="agent-access-not-enforced">{copy.notEnforced}</p> : null}
      </div>

      {access ? (
        <>
          <div className="settings-subsection">
            <h4 className={styles.subhead}>{copy.foldersTitle}</h4>
            <p className="hint">{copy.foldersHint}</p>
            {access.allowedDirs.length === 0 ? (
              <p className="hint">{copy.onlyProject}</p>
            ) : (
              <ul className={styles.list}>
                {access.allowedDirs.map((dir) => (
                  <li key={dir} className={styles.item}>
                    <span className={styles.path} title={dir}>{dir}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      data-testid="agent-access-remove"
                      onClick={() => void save({ allowedDirs: access.allowedDirs.filter((d) => d !== dir) })}
                    >
                      {copy.remove}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className={styles.addRow}
              onSubmit={(e) => {
                e.preventDefault();
                const dir = draft.trim();
                if (!dir) return;
                setDraft('');
                void save({ allowedDirs: [...access.allowedDirs, dir] });
              }}
            >
              <Input
                value={draft}
                placeholder={copy.addPlaceholder}
                aria-label={copy.add}
                data-testid="agent-access-folder-input"
                onChange={(e) => setDraft(e.target.value)}
              />
              <Button type="submit" variant="ghost" data-testid="agent-access-add">
                {copy.add}
              </Button>
            </form>
          </div>

          <div className="settings-subsection settings-privacy-toggles">
            {toggle(access.readWholeMac, copy.readAll, copy.readAllHint, 'agent-access-read-all', () => void save({ readWholeMac: !access.readWholeMac }))}
            {toggle(
              access.macControl,
              copy.macControl,
              copy.macControlHint,
              'agent-access-mac-control',
              () => void save({ macControl: !access.macControl }),
              access.macControl && mac?.supported ? (mac.accessibility ? copy.accessibilityOn : copy.accessibilityOff) : null,
            )}
          </div>

          <div className="settings-subsection">
            <h4 className={styles.subhead}>{copy.rulesTitle}</h4>
            <ul className={styles.rules}>
              {copy.rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {error ? (
        <p className="hint" role="status" data-testid="agent-access-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
