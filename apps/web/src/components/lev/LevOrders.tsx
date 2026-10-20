import { useEffect, useState } from 'react';
import type { OrchestratorOrder, OrchestratorOrdersResponse } from '@open-design/contracts';
import { useI18n } from '../../i18n';
import { navigate } from '../../router';
import styles from './LevOrders.module.css';

const TERMINAL = new Set(['succeeded', 'failed', 'canceled']);
const POLL_MS = 2000;

const COPY = {
  es: {
    running: 'Trabajando',
    queued: 'En cola',
    succeeded: 'Listo',
    failed: 'Falló',
    canceled: 'Detenido',
    open: 'Abrir',
    untitled: 'Orden de Lev',
  },
  en: {
    running: 'Working',
    queued: 'Queued',
    succeeded: 'Done',
    failed: 'Failed',
    canceled: 'Stopped',
    open: 'Open',
    untitled: "Lev's order",
  },
};

export function statusLabel(status: string, copy: typeof COPY.es): string {
  if (status === 'succeeded') return copy.succeeded;
  if (status === 'failed') return copy.failed;
  if (status === 'canceled') return copy.canceled;
  if (status === 'queued') return copy.queued;
  return copy.running;
}

/**
 * The work a Lev turn handed to projects, as cards: which project, which
 * conversation, how it is going, and a way into that conversation. Polls while
 * the turn or any order is still running.
 */
export function LevOrders({ runId, live }: { runId: string; live: boolean }) {
  const { locale } = useI18n();
  const copy = locale.toLowerCase().startsWith('es') ? COPY.es : COPY.en;
  const [orders, setOrders] = useState<OrchestratorOrder[]>([]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      let next: OrchestratorOrder[] = [];
      try {
        const resp = await fetch(`/api/orchestrator/orders?runId=${encodeURIComponent(runId)}`);
        if (resp.ok) next = ((await resp.json()) as OrchestratorOrdersResponse).orders;
      } catch {
        // Keep what is shown; try again on the next tick.
      }
      if (!alive) return;
      setOrders(next);
      const pending = live || next.some((order) => !TERMINAL.has(order.status));
      if (pending) timer = setTimeout(() => void load(), POLL_MS);
    };
    void load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [runId, live]);

  if (orders.length === 0) return null;
  return (
    <ul className={styles.list} data-testid="lev-orders">
      {orders.map((order) => (
        <li key={order.runId} className={styles.card} data-status={order.status}>
          <span className={styles.dot} aria-hidden />
          <span className={styles.body}>
            <span className={styles.project}>{order.projectName ?? order.projectId}</span>
            <span className={styles.title}>{order.conversationTitle ?? copy.untitled}</span>
          </span>
          <span className={styles.status}>{statusLabel(order.status, copy)}</span>
          <button
            type="button"
            className={styles.open}
            data-testid="lev-order-open"
            onClick={() =>
              navigate({
                kind: 'project',
                projectId: order.projectId,
                conversationId: order.conversationId,
                fileName: null,
              })
            }
          >
            {copy.open}
          </button>
        </li>
      ))}
    </ul>
  );
}
