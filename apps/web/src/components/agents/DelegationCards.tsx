import { useMemo } from 'react';
import { navigate } from '../../router';
import { useRunDelegates } from '../../state/run-delegates';
import { getAgentsCopyForDocument } from './agents-copy';
import styles from './DelegationCards.module.css';

/**
 * What the orchestrator handed off during a turn, under that turn: which agent,
 * whether it is still working, and a way into its own conversation.
 *
 * It exists only when there was a delegation. A turn that answered on its own
 * (the common case: conversation, simple questions) renders nothing at all, so
 * "Orchestrator" never labels a turn that did not orchestrate.
 */
export function DelegationCards({
  projectId,
  runId,
  live,
}: {
  projectId: string | null | undefined;
  runId: string | null | undefined;
  live: boolean;
}) {
  const delegates = useRunDelegates(projectId, runId, live);
  const copy = useMemo(() => getAgentsCopyForDocument(), []);
  if (!projectId || delegates.length === 0) return null;

  const statusOf = (status: string) => {
    if (status === 'succeeded') return { label: copy.delegateDone, tone: styles.done };
    if (status === 'failed') return { label: copy.delegateFailed, tone: styles.failed };
    if (status === 'canceled') return { label: copy.delegateCanceled, tone: styles.failed };
    return { label: copy.delegateRunning, tone: styles.running };
  };

  return (
    <div className={styles.root} data-testid="delegation-cards">
      <div className={styles.title}>{copy.delegatedTitle}</div>
      {delegates.map((delegate) => {
        const { label, tone } = statusOf(delegate.status);
        const who = delegate.agent
          ? [delegate.agent.emoji, delegate.agent.name].filter(Boolean).join(' ')
          : copy.delegateWorker;
        return (
          <div
            key={delegate.runId}
            className={`${styles.card}${delegate.depth > 1 ? ` ${styles.nested}` : ''}`}
            data-testid={`delegation-card-${delegate.runId}`}
          >
            <span className={styles.who}>{who}</span>
            <span className={`${styles.status} ${tone}`}>
              <span className={styles.dot} aria-hidden="true" />
              {label}
            </span>
            {delegate.conversationId ? (
              <button
                type="button"
                className={styles.open}
                onClick={() =>
                  navigate({
                    kind: 'project',
                    projectId,
                    conversationId: delegate.conversationId,
                    fileName: null,
                  })
                }
              >
                {copy.delegateOpen}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
