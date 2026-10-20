import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@open-design/contracts';
import { Button } from '@open-design/components';
import { renderMarkdown } from '../../runtime/markdown';
import { stripInternalControlMarkers } from '../../artifacts/internal-markers';
import { useI18n } from '../../i18n';
import { reportedUsageFromEvents, TurnMeter } from '../TurnMeter';
import { LevOrders } from './LevOrders';
import { LevSessions } from './LevSessions';
import styles from './LevChat.module.css';

const SELF_CLOSING_MARKER = /<od-(?:done|next|focus)\b[^>]*\/>/g;

/**
 * What a reply shows: the part after the turn's done marker when there is one
 * (before it is the working narration), without the app's control markers.
 */
export function visibleReplyText(content: string, streaming: boolean): string {
  const done = content.search(/<od-done\b[^>]*\/>/);
  const answer = done >= 0 ? content.slice(done) : content;
  return stripInternalControlMarkers(answer.replace(SELF_CLOSING_MARKER, ''), { streaming }).trim();
}

const COPY = {
  es: { thinking: 'Lev está pensando…', newSession: 'Nueva sesión', fold: 'Contraer', title: 'Lev' },
  en: { thinking: 'Lev is thinking…', newSession: 'New session', fold: 'Fold', title: 'Lev' },
};

export interface LevChatProps {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  onNewSession: () => void;
  onFold: () => void;
  currentSessionId: string | null;
  onPickSession: (projectId: string, sessionId: string) => void;
  onSessionDeleted?: (sessionId: string) => void;
}

/** Lev's conversation on Home, above the composer. */
export function LevChat({ messages, streaming, error, onNewSession, onFold, currentSessionId, onPickSession, onSessionDeleted }: LevChatProps) {
  const { locale } = useI18n();
  const copy = locale.toLowerCase().startsWith('es') ? COPY.es : COPY.en;
  const endRef = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1];

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length, last?.content]);

  return (
    <section className={styles.chat} aria-label={copy.title} data-testid="lev-chat">
      <header className={styles.bar}>
        <span className={styles.title}>{copy.title}</span>
        <span className={styles.actions}>
          <LevSessions currentSessionId={currentSessionId} onPick={onPickSession} onDeleted={onSessionDeleted} />
          <Button size="sm" variant="ghost" onClick={onNewSession} data-testid="lev-new-session">
            {copy.newSession}
          </Button>
          <Button size="sm" variant="ghost" onClick={onFold} data-testid="lev-fold">
            {copy.fold}
          </Button>
        </span>
      </header>
      <div className={styles.log} data-testid="lev-chat-log">
        {messages.map((message) => {
          if (message.role === 'user') {
            return (
              <div key={message.id} className={styles.user}>
                <p className={styles.bubble}>{message.content}</p>
              </div>
            );
          }
          const isLive = streaming && message.id === last?.id;
          const text = visibleReplyText(message.content, isLive);
          return (
            <div key={message.id} className={styles.assistant} data-testid="lev-reply">
              {text ? (
                <div className={styles.prose}>{renderMarkdown(text)}</div>
              ) : isLive ? (
                <p className={styles.thinking}>{copy.thinking}</p>
              ) : null}
              {message.runId ? <LevOrders runId={message.runId} live={isLive} /> : null}
              {!isLive && (message.runId || message.events?.length) ? (
                <div className={styles.meta}>
                  <TurnMeter runId={message.runId} usage={reportedUsageFromEvents(message.events)} />
                </div>
              ) : null}
            </div>
          );
        })}
        {error ? <p className={styles.error} role="status">{error}</p> : null}
        <div ref={endRef} />
      </div>
    </section>
  );
}
