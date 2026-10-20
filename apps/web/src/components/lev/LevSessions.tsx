import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { OrchestratorWorkspaceResponse } from '@open-design/contracts';
import { useI18n } from '../../i18n';
import { deleteLevSession, fetchLevSpace } from '../../state/lev-session';
import styles from './LevSessions.module.css';

type Session = OrchestratorWorkspaceResponse['sessions'][number];

const COPY = {
  es: { open: 'Sesiones', title: 'Sesiones anteriores', empty: 'Aún no hay sesiones.', current: 'Actual', untitled: 'Sesión sin título', loading: 'Cargando…', remove: 'Eliminar sesión', confirm: '¿Eliminar?', yes: 'Eliminar', no: 'Cancelar', failed: 'No se pudo eliminar.' },
  en: { open: 'Sessions', title: 'Earlier sessions', empty: 'No sessions yet.', current: 'Current', untitled: 'Untitled session', loading: 'Loading…', remove: 'Delete session', confirm: 'Delete?', yes: 'Delete', no: 'Cancel', failed: 'It could not be deleted.' },
};

export function sessionLabel(session: Session, untitled: string): string {
  return session.title?.trim() || session.preview || untitled;
}

function formatWhen(at: number, locale: string): string {
  const date = new Date(at);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

export interface LevSessionsProps {
  currentSessionId: string | null;
  onPick: (projectId: string, sessionId: string) => void;
  /** Rendered as a quiet text button (folded Home) instead of the chat bar's button. */
  quiet?: boolean;
  /** A session was deleted (the chat clears itself when it was the open one). */
  onDeleted?: (sessionId: string) => void;
}

/**
 * Lev's earlier sessions, newest first. The list is read when it opens; a
 * session is named by the title the agent gave it, or by its first message.
 */
export function LevSessions({ currentSessionId, onPick, quiet = false, onDeleted }: LevSessionsProps) {
  const { locale } = useI18n();
  const copy = locale.toLowerCase().startsWith('es') ? COPY.es : COPY.en;
  const [open, setOpen] = useState(false);
  const [space, setSpace] = useState<OrchestratorWorkspaceResponse | null>(null);
  const [place, setPlace] = useState<CSSProperties>({ left: 0, top: 0 });
  const [confirming, setConfirming] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const remove = async (projectId: string, sessionId: string) => {
    setFailed(false);
    try {
      await deleteLevSession(projectId, sessionId);
      setSpace((current) => current && { ...current, sessions: current.sessions.filter((s) => s.id !== sessionId) });
      onDeleted?.(sessionId);
    } catch {
      setFailed(true);
    }
    setConfirming(null);
  };
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setSpace(null);
    void fetchLevSpace()
      .then((value) => {
        if (alive) setSpace(value);
      })
      .catch(() => {
        if (alive) setSpace({ projectId: '', sessions: [] });
      });
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      alive = false;
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // In a layer of its own, kept inside the window: below the button when it
  // fits, above it otherwise.
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const gap = 8;
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const left = Math.min(Math.max(gap, trigger.right - width), window.innerWidth - width - gap);
      const below = trigger.bottom + gap;
      const top = below + height <= window.innerHeight - gap ? below : Math.max(gap, trigger.top - height - gap);
      setPlace({ left, top });
    };
    reposition();
    window.addEventListener('resize', reposition);
    return () => window.removeEventListener('resize', reposition);
  }, [open, space]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={quiet ? styles.quietTrigger : styles.trigger}
        aria-expanded={open}
        data-testid="lev-sessions"
        onClick={() => setOpen((v) => !v)}
      >
        {copy.open}
      </button>
      {typeof document === 'undefined'
        ? null
        : createPortal(
            <div
              ref={panelRef}
              className={styles.panel}
              style={place}
              data-open={open ? 'true' : 'false'}
              role="dialog"
              aria-label={copy.title}
              data-testid="lev-sessions-panel"
            >
              <strong className={styles.title}>{copy.title}</strong>
              {failed ? <p className={styles.note} role="status">{copy.failed}</p> : null}
              {space === null ? (
                <p className={styles.note}>{copy.loading}</p>
              ) : space.sessions.length === 0 ? (
                <p className={styles.note}>{copy.empty}</p>
              ) : (
                <ul className={styles.list}>
                  {space.sessions.map((session) => (
                    <li key={session.id} className={styles.row}>
                      <button
                        type="button"
                        className={styles.item}
                        aria-current={session.id === currentSessionId ? 'true' : undefined}
                        data-testid="lev-session-item"
                        onClick={() => {
                          setOpen(false);
                          onPick(space.projectId, session.id);
                        }}
                      >
                        <span className={styles.name}>{sessionLabel(session, copy.untitled)}</span>
                        <span className={styles.when}>
                          {session.id === currentSessionId ? copy.current : formatWhen(session.updatedAt, locale)}
                        </span>
                      </button>
                      {confirming === session.id ? (
                        <span className={styles.confirm}>
                          <span>{copy.confirm}</span>
                          <button
                            type="button"
                            className={styles.danger}
                            data-testid="lev-session-delete-confirm"
                            onClick={() => void remove(space.projectId, session.id)}
                          >
                            {copy.yes}
                          </button>
                          <button type="button" className={styles.plain} onClick={() => setConfirming(null)}>
                            {copy.no}
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={styles.remove}
                          aria-label={copy.remove}
                          title={copy.remove}
                          data-testid="lev-session-delete"
                          onClick={() => setConfirming(session.id)}
                        >
                          ×
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>,
            document.body,
          )}
    </>
  );
}
