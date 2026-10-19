import { useEffect, useState } from 'react';
import { formatElapsed, type StatusPanelState } from '../runtime/chat/status-panel';
import { useAgentsCopy } from './agents/use-agents-copy';
import { Icon } from './Icon';
import styles from './ChatStatusPanel.module.css';

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function Section({
  title,
  meta,
  defaultOpen = true,
  testId,
  children,
}: {
  title: string;
  meta?: string;
  defaultOpen?: boolean;
  testId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={styles.card} data-testid={testId}>
      <button type="button" className={styles.header} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{title}</span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
        <span className={`${styles.chevron}${open ? ` ${styles.chevronOpen}` : ''}`} aria-hidden="true">
          <Icon name="chevron-right" size={14} />
        </span>
      </button>
      {open ? children : null}
    </section>
  );
}

/**
 * The Ask conversation's side panel: the assistant's plan, what is working in the
 * background (agents the orchestrator started) and what changed in the project.
 * Every section is optional; the host mounts the panel only when something is
 * there to show.
 */
export function ChatStatusPanel({
  state,
  onOpenFile,
  onOpenConversation,
  onSendMessage,
}: {
  state: StatusPanelState;
  onOpenFile: (name: string) => void;
  onOpenConversation: (conversationId: string) => void;
  /** Sends a message to the conversation: the delivery buttons are the user's reply. */
  onSendMessage?: (text: string) => void;
}) {
  const copy = useAgentsCopy();
  const running = state.background?.running ?? [];
  const now = useNow(running.length > 0);
  const [showFinished, setShowFinished] = useState(false);
  const who = (agent: { name: string; emoji: string | null } | null) =>
    agent ? [agent.emoji, agent.name].filter(Boolean).join(' ') : copy.delegateWorker;

  const action = state.delivery?.action ?? null;
  const actionLabel = !action
    ? ''
    : action.kind === 'publish'
      ? copy.deliveryPublish
      : action.kind === 'retry'
        ? copy.deliveryRetry
        : copy.deliveryContinue;
  const actionMessage = !action
    ? ''
    : action.kind === 'publish'
      ? copy.deliveryPublishMessage
      : action.kind === 'retry'
        ? copy.deliveryRetryMessage(action.stageName)
        : copy.deliveryContinueMessage(action.stageName);

  return (
    <aside className={styles.root} data-testid="chat-status-panel">
      {state.tasks ? (
        <Section
          title={copy.statusTasks}
          meta={copy.statusTasksProgress(state.tasks.completed, state.tasks.total)}
          testId="status-tasks"
        >
          <ul className={styles.list}>
            {state.tasks.items.map((task, index) => (
              <li key={`${index}-${task.content}`} className={styles.row} data-mark={task.mark}>
                <span
                  className={`${styles.mark} ${
                    task.mark === 'done'
                      ? styles.markDone
                      : task.mark === 'running'
                        ? styles.markRunning
                        : task.mark === 'stopped'
                          ? styles.markStopped
                          : ''
                  }`}
                  aria-hidden="true"
                >
                  {task.mark === 'done' ? <Icon name="check" size={10} strokeWidth={3} /> : null}
                </span>
                <span className={`${styles.label}${task.mark === 'done' ? ` ${styles.struck}` : ''}`}>
                  {task.content}
                </span>
              </li>
            ))}
          </ul>
          {action && onSendMessage ? (
            <button
              type="button"
              className={styles.action}
              data-testid={`delivery-action-${action.kind}`}
              onClick={() => onSendMessage(actionMessage)}
            >
              {actionLabel}
            </button>
          ) : null}
        </Section>
      ) : null}

      {state.background ? (
        <Section title={copy.statusBackground} testId="status-background">
          <ul className={styles.list}>
            {running.map((item) => (
              <li key={item.runId} className={styles.row}>
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.label}>{who(item.agent)}</span>
                <span className={styles.soft}>{formatElapsed(now - item.createdAt)}</span>
                {item.conversationId ? (
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => onOpenConversation(item.conversationId as string)}
                    aria-label={`${copy.delegateOpen}: ${who(item.agent)}`}
                  >
                    <Icon name="chevron-right" size={14} />
                  </button>
                ) : null}
              </li>
            ))}
            {state.background.finished.length > 0 ? (
              <>
                <li className={styles.row}>
                  <button
                    type="button"
                    className={`${styles.rowButton}`}
                    aria-expanded={showFinished}
                    onClick={() => setShowFinished((v) => !v)}
                    data-testid="status-finished-toggle"
                  >
                    {copy.statusFinished(state.background.finished.length)}
                  </button>
                </li>
                {showFinished
                  ? state.background.finished.map((item) => (
                      <li key={item.runId} className={styles.row}>
                        <span
                          className={`${styles.dot} ${item.status === 'succeeded' ? styles.dotDone : styles.dotFailed}`}
                          aria-hidden="true"
                        />
                        <span className={styles.label}>{who(item.agent)}</span>
                        <span className={styles.soft}>
                          {item.status === 'succeeded'
                            ? copy.delegateDone
                            : item.status === 'canceled'
                              ? copy.delegateCanceled
                              : copy.delegateFailed}
                        </span>
                        {item.conversationId ? (
                          <button
                            type="button"
                            className={styles.iconButton}
                            onClick={() => onOpenConversation(item.conversationId as string)}
                            aria-label={`${copy.delegateOpen}: ${who(item.agent)}`}
                          >
                            <Icon name="chevron-right" size={14} />
                          </button>
                        ) : null}
                      </li>
                    ))
                  : null}
              </>
            ) : null}
          </ul>
        </Section>
      ) : null}

      {state.changes ? (
        <Section
          title={copy.statusChanges}
          meta={copy.statusChangesCount(state.changes.count)}
          testId="status-changes"
        >
          <ul className={styles.list}>
            {state.changes.files.map((file) => (
              <li key={file.name}>
                <button
                  type="button"
                  className={`${styles.row} ${styles.rowButton}`}
                  onClick={() => onOpenFile(file.name)}
                  aria-label={copy.statusOpenFile(file.name)}
                  data-testid={`status-change-${file.name}`}
                >
                  <Icon name="file" size={14} />
                  <span className={styles.label} title={file.name}>
                    {file.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </aside>
  );
}

/** Show or hide the panel; the host renders it only when there is something to show. */
export function ChatStatusToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  const copy = useAgentsCopy();
  const label = shown ? copy.statusHide : copy.statusShow;
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-pressed={shown}
      aria-label={label}
      title={label}
      onClick={onToggle}
      data-testid="chat-status-toggle"
    >
      <Icon name="layout-right" size={16} />
    </button>
  );
}
