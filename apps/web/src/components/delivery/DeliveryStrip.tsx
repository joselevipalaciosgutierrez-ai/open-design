import { useState } from 'react';
import type { DeliveryStatusResponse } from '@open-design/contracts';
import { useAgentsCopy } from '../agents/use-agents-copy';
import { Icon } from '../Icon';
import { deliveryStripView } from './delivery-strip-state';
import styles from './DeliveryStrip.module.css';

export interface DeliveryStripProps {
  delivery: DeliveryStatusResponse | null;
  /** A run is working right now: no next move is offered while it is. */
  runActive: boolean;
  /** Sends a message to the conversation: the button is the user's reply. */
  onSendMessage: (text: string) => void;
}

/**
 * A slim card above the composer for a staged delivery, shown where the status
 * panel is not (the Design layout). The header says how far the delivery is and
 * what is next, and carries the one move the user can make; opening it lists the
 * stages. It sits in the page flow, not floating, so it never covers messages.
 */
export function DeliveryStrip({ delivery, runActive, onSendMessage }: DeliveryStripProps) {
  const copy = useAgentsCopy();
  const [open, setOpen] = useState(false);
  const view = deliveryStripView(delivery, runActive);
  if (!view) return null;

  const { action } = view;
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
  const line = view.blocked
    ? `${copy.deliveryBlocked}: ${view.focus?.name ?? ''}`
    : view.readyToPublish
      ? copy.deliveryReady
      : (view.focus?.name ?? copy.deliveryAllDone);

  return (
    <div className={styles.strip} data-testid="delivery-strip" data-blocked={view.blocked ? 'true' : undefined}>
      <div className={styles.head}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-controls="delivery-strip-stages"
          onClick={() => setOpen((v) => !v)}
          data-testid="delivery-strip-toggle"
        >
          <span className={styles.title}>{copy.deliveryTitle}</span>
          <span className={styles.progress} aria-label={copy.statusTasksProgress(view.completed, view.total)}>
            {copy.statusTasksProgress(view.completed, view.total)}
          </span>
          <span className={styles.line}>{line}</span>
          <span className={`${styles.chevron}${open ? ` ${styles.chevronOpen}` : ''}`} aria-hidden="true">
            <Icon name="chevron-down" size={14} />
          </span>
        </button>
        {action ? (
          <button
            type="button"
            className={styles.action}
            data-testid={`delivery-strip-action-${action.kind}`}
            onClick={() => onSendMessage(actionMessage)}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className={`${styles.stages}${open ? ` ${styles.stagesOpen}` : ''}`} id="delivery-strip-stages">
        <ul className={styles.list} inert={!open ? true : undefined}>
          {view.stages.map((stage) => (
            <li key={stage.id} className={styles.row} data-status={stage.status}>
              <span
                className={`${styles.mark} ${
                  stage.status === 'done'
                    ? styles.markDone
                    : stage.status === 'running'
                      ? styles.markRunning
                      : stage.status === 'blocked'
                        ? styles.markBlocked
                        : ''
                }`}
                aria-hidden="true"
              >
                {stage.status === 'done' ? <Icon name="check" size={10} strokeWidth={3} /> : null}
              </span>
              <span className={`${styles.label}${stage.status === 'done' ? ` ${styles.struck}` : ''}`}>{stage.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
