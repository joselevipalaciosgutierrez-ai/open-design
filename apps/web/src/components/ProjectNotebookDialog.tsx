import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from '@open-design/components';
import type { ProjectNotebookResponse } from '@open-design/contracts';
import { useI18n } from '../i18n';
import styles from './ProjectNotebookDialog.module.css';

const COPY = {
  es: {
    title: (name: string) => `Libreta · ${name}`,
    hint: 'Lo que se hizo en este proyecto y lo que se decidió. Se escribe sola al terminar cada tarea, y Lev o los agentes añaden decisiones. Puedes corregirla o borrar líneas.',
    empty: 'Aún no hay nada apuntado.',
    save: 'Guardar',
    close: 'Cerrar',
    saved: 'Guardada.',
    failed: 'No se pudo guardar.',
    loading: 'Cargando…',
  },
  en: {
    title: (name: string) => `Notebook · ${name}`,
    hint: 'What was done in this project and what was decided. It writes itself when each task ends, and Lev or the agents add decisions. You can correct it or delete lines.',
    empty: 'Nothing written yet.',
    save: 'Save',
    close: 'Close',
    saved: 'Saved.',
    failed: 'It could not be saved.',
    loading: 'Loading…',
  },
};

/** A project's notebook, to read and correct (notebook.ts in the daemon). */
export function ProjectNotebookDialog({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
}) {
  const { locale } = useI18n();
  const copy = locale.toLowerCase().startsWith('es') ? COPY.es : COPY.en;
  const [text, setText] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch(`/api/projects/${encodeURIComponent(projectId)}/notebook`)
      .then((resp) => (resp.ok ? (resp.json() as Promise<ProjectNotebookResponse>) : { projectId, text: '' }))
      .catch(() => ({ projectId, text: '' }))
      .then((body) => {
        if (alive) setText(body.text);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const save = async () => {
    setStatus(null);
    try {
      const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/notebook`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: text ?? '' }),
      });
      setStatus(resp.ok ? copy.saved : copy.failed);
    } catch {
      setStatus(copy.failed);
    }
  };

  return (
    <Dialog onClose={onClose} ariaLabel={copy.title(projectName)} data-testid="project-notebook-dialog">
      <DialogHeader>
        <DialogTitle>{copy.title(projectName)}</DialogTitle>
        <DialogDescription>{copy.hint}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        {text === null ? (
          <p className={styles.note}>{copy.loading}</p>
        ) : (
          <Textarea
            className={styles.editor}
            value={text}
            placeholder={copy.empty}
            onChange={(event) => setText(event.target.value)}
            data-testid="project-notebook-text"
          />
        )}
        {status ? <p className={styles.note} role="status">{status}</p> : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>{copy.close}</Button>
        <Button onClick={() => void save()} disabled={text === null} data-testid="project-notebook-save">
          {copy.save}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
