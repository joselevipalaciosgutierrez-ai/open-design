import { useCallback, useEffect, useState } from 'react';
import { Button } from '@open-design/components';
import type { Lesson, LessonsResponse } from '@open-design/contracts';
import { useI18n } from '../../i18n';
import base from './AssistantSettings.module.css';
import styles from './LessonsSettings.module.css';

const COPY = {
  es: {
    title: 'Lo que aprendieron',
    hint: 'Cuando un agente se equivoca y encuentra el arreglo, o tú lo corriges, apunta una regla corta para no repetirlo. Empieza solo para ese proyecto; si el mismo error aparece en otro proyecto, pasa a ser del agente, y si lo aprende otro agente, de todos. Confirmada tres veces, se aplica siempre. Las que no se usan en 60 días se olvidan.',
    empty: 'Aún no han aprendido nada.',
    scope: { project: 'Proyecto', agent: 'Agente', global: 'Todos' } as Record<Lesson['scope'], string>,
    standing: 'Siempre',
    times: (n: number) => (n === 1 ? '1 vez' : `${n} veces`),
    remove: 'Quitar',
    failed: 'No se pudo cargar.',
  },
  en: {
    title: 'What they learned',
    hint: "When an agent gets something wrong and finds the fix, or you correct it, it writes a short rule so it does not happen again. It starts for that project only; if the same mistake shows up in another project it becomes the agent's, and if another agent learns it, everyone's. Confirmed three times, it always applies. Unused ones are forgotten after 60 days.",
    empty: 'Nothing learned yet.',
    scope: { project: 'Project', agent: 'Agent', global: 'Everyone' } as Record<Lesson['scope'], string>,
    standing: 'Always',
    times: (n: number) => (n === 1 ? 'once' : `${n} times`),
    remove: 'Remove',
    failed: 'It could not be loaded.',
  },
};

/** Settings → the lessons agents recorded (lessons.ts), each removable. */
export function LessonsSettings() {
  const { locale } = useI18n();
  const copy = locale.toLowerCase().startsWith('es') ? COPY.es : COPY.en;
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const resp = await fetch('/api/lessons');
      if (!resp.ok) throw new Error(String(resp.status));
      setLessons(((await resp.json()) as LessonsResponse).lessons);
    } catch {
      setError(copy.failed);
      setLessons([]);
    }
  }, [copy.failed]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (id: string) => {
    const resp = await fetch(`/api/lessons/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (resp.ok) setLessons((current) => (current ?? []).filter((lesson) => lesson.id !== id));
  };

  return (
    <div className={base.block} data-testid="lessons-settings">
      <div className="settings-general-block-head">
        <h3>{copy.title}</h3>
        <p className="hint">{copy.hint}</p>
      </div>
      {lessons && lessons.length === 0 ? <p className={base.status}>{error ?? copy.empty}</p> : null}
      {lessons && lessons.length > 0 ? (
        <ul className={styles.list}>
          {lessons.map((lesson) => (
            <li key={lesson.id} className={styles.item} data-testid="lesson-item">
              <span className={styles.rule}>{lesson.rule}</span>
              <span className={styles.meta}>
                <span className={styles.badge}>{copy.scope[lesson.scope]}</span>
                {lesson.confirmations >= 3 ? <span className={styles.badge}>{copy.standing}</span> : null}
                <span>{copy.times(lesson.confirmations)}</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => void remove(lesson.id)} data-testid="lesson-remove">
                {copy.remove}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
