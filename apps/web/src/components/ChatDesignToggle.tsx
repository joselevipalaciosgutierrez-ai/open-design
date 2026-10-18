import type { ChatSessionMode } from '@open-design/contracts';
import { useT } from '../i18n';
import styles from './ChatDesignToggle.module.css';

/**
 * Chat ⇄ Design, always one click away at the top of the chat.
 *
 * Chat (Ask) hides the design panel and keeps the conversation front and
 * centre; Design brings the workspace back. It sets the same conversation
 * session mode as the composer's mode picker, so the two stay in step. Plan has
 * no segment here: while a conversation is in Plan neither segment is lit, and
 * either click leaves Plan for that mode.
 */
export function ChatDesignToggle({
  mode,
  onModeChange,
}: {
  mode: ChatSessionMode;
  onModeChange: (mode: ChatSessionMode) => void;
}) {
  const t = useT();
  const segments: Array<{ id: ChatSessionMode; label: string }> = [
    { id: 'chat', label: t('chat.mode.chat.label') },
    { id: 'design', label: t('chat.mode.design.label') },
  ];
  return (
    <div className={styles.root} role="group" aria-label={t('chat.modePicker.mode')} data-testid="chat-design-toggle">
      {segments.map((segment) => {
        const active = mode === segment.id;
        return (
          <button
            key={segment.id}
            type="button"
            className={`${styles.segment}${active ? ` ${styles.active}` : ''}`}
            aria-pressed={active}
            data-testid={`chat-design-toggle-${segment.id}`}
            onClick={() => {
              if (!active) onModeChange(segment.id);
            }}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}
