import { useEffect, useMemo, useState } from 'react';
import type { AgentProfile } from '@open-design/contracts';
import { useI18n } from '../../i18n';
import { listAgentProfiles } from '../../state/agent-profiles';
import { getAgentsCopy } from './agents-copy';
import styles from './AgentChip.module.css';

/**
 * Shows which agent profile a conversation runs as. The daemon forces the
 * profile's runtime and model on every run, so this is the truthful label for
 * what will answer, unlike the composer's global model picker.
 */
export function AgentChip({ agentProfileId }: { agentProfileId: string | null | undefined }) {
  const { locale } = useI18n();
  const copy = useMemo(() => getAgentsCopy(locale), [locale]);
  const [profile, setProfile] = useState<AgentProfile | null>(null);

  useEffect(() => {
    setProfile(null);
    if (!agentProfileId) return;
    let cancelled = false;
    listAgentProfiles()
      .then((profiles) => {
        if (!cancelled) setProfile(profiles.find((p) => p.id === agentProfileId) ?? null);
      })
      .catch(() => {
        // The chip is informational; a failed lookup just hides it.
      });
    return () => {
      cancelled = true;
    };
  }, [agentProfileId]);

  if (!agentProfileId || !profile) return null;
  const label = [profile.emoji, profile.name].filter(Boolean).join(' ');
  return (
    <div className={styles.chip} title={profile.role ?? undefined} data-testid="agent-chip">
      <span className={styles.name}>{label}</span>
      <span className={styles.meta}>
        {profile.runtimeId} · {profile.model ?? copy.modelDefault}
      </span>
    </div>
  );
}
