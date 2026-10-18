import { useAgentsCopy } from './agents/use-agents-copy';
import { Icon } from './Icon';
import styles from './ChatPreviewCloseButton.module.css';

/** Puts an Ask conversation back to chat only after a file was previewed beside it. */
export function ChatPreviewCloseButton({ onClose }: { onClose: () => void }) {
  const label = useAgentsCopy().previewClose;
  return (
    <button type="button" className={styles.root} onClick={onClose} data-testid="chat-preview-close">
      <Icon name="close" size={14} />
      {label}
    </button>
  );
}
