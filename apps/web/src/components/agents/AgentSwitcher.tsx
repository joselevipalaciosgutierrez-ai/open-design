import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentProfile } from '@open-design/contracts';
import { useI18n } from '../../i18n';
import { navigate } from '../../router';
import { listAgentProfiles } from '../../state/agent-profiles';
import { patchConversation } from '../../state/projects';
import { getAgentsCopy } from './agents-copy';
import styles from './AgentSwitcher.module.css';

/**
 * Switches which agent profile answers this conversation. The daemon reads the
 * conversation's profile when it creates a run and forces that profile's
 * runtime and model, so the change applies from the next message on.
 */
export function AgentSwitcher({
  projectId,
  conversationId,
  agentProfileId,
}: {
  projectId: string | null | undefined;
  conversationId: string | null | undefined;
  agentProfileId: string | null | undefined;
}) {
  const { locale } = useI18n();
  const copy = useMemo(() => getAgentsCopy(locale), [locale]);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [override, setOverride] = useState<{ conversationId: string; id: string | null } | null>(
    null,
  );
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAgentProfiles()
      .then((list) => {
        if (!cancelled) setProfiles(list);
      })
      .catch(() => {
        // Informational control: without the list it simply stays hidden.
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!projectId || !conversationId || profiles.length === 0) return null;

  const currentId =
    override && override.conversationId === conversationId ? override.id : (agentProfileId ?? null);
  const current = profiles.find((p) => p.id === currentId) ?? null;

  const choose = async (id: string | null) => {
    setOpen(false);
    if (id === currentId) return;
    const updated = await patchConversation(projectId, conversationId, { agentProfileId: id });
    if (updated) setOverride({ conversationId, id });
  };

  return (
    <div className={styles.root} ref={rootRef} data-testid="agent-switcher">
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        title={current?.role ?? undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.name}>
          {current ? [current.emoji, current.name].filter(Boolean).join(' ') : copy.switcherNone}
        </span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div className={styles.menu} role="menu">
          <div className={styles.heading}>{copy.switcherTitle}</div>
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              role="menuitemradio"
              aria-checked={profile.id === currentId}
              className={`${styles.option} ${profile.id === currentId ? styles.optionActive : ''}`}
              onClick={() => void choose(profile.id)}
            >
              <span>{[profile.emoji, profile.name].filter(Boolean).join(' ')}</span>
              <span className={styles.runtime}>{profile.runtimeId}</span>
            </button>
          ))}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={currentId === null}
            className={`${styles.option} ${currentId === null ? styles.optionActive : ''}`}
            onClick={() => void choose(null)}
          >
            {copy.switcherNone}
          </button>
          <div className={styles.divider} />
          <button
            type="button"
            role="menuitem"
            className={styles.option}
            onClick={() => navigate({ kind: 'home', view: 'agents' })}
          >
            {copy.switcherAll}
          </button>
        </div>
      ) : null}
    </div>
  );
}
