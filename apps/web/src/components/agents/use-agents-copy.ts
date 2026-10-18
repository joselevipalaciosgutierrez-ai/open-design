import { useMemo } from 'react';
import { useI18n } from '../../i18n';
import { getAgentsCopy, type AgentsCopy } from './agents-copy';

/**
 * The agents copy for the app's UI language, from the same i18n context the rest
 * of the interface reads.
 *
 * It must not read `<html lang>`: that attribute is written by every language
 * provider, in an effect after the first render, and with nested providers the
 * outer one wins, so it can say "en" while the interface is in Spanish.
 */
export function useAgentsCopy(): AgentsCopy {
  const { locale } = useI18n();
  return useMemo(() => getAgentsCopy(locale), [locale]);
}
