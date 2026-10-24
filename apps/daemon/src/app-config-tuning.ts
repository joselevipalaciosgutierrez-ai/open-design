import os from 'node:os';

import {
  APP_CONFIG_TUNING,
  type AppConfigTuningKey,
  type AppConfigTuningResponse,
  type AppConfigTuningSetting,
} from '@open-design/contracts';

import type { AppConfigPrefs } from './app-config.js';
import { WARM_AGENT_IDLE_MS, defaultMaxParked } from './runtimes/warm-agents.js';

/**
 * The tuning preferences with what is stored, what applies now and what would
 * apply by default. The defaults live next to the code that uses them (the
 * process limit depends on the machine's memory), so the Settings panel and
 * `od config describe` ask the daemon instead of recomputing them.
 */
export function describeTuning(
  prefs: AppConfigPrefs,
  totalMemoryBytes: number = os.totalmem(),
): AppConfigTuningResponse {
  const defaults: Record<AppConfigTuningKey, number> = {
    antigravityWarmMax: defaultMaxParked(totalMemoryBytes),
    antigravityWarmIdleSeconds: WARM_AGENT_IDLE_MS / 1000,
  };
  const settings = (Object.keys(APP_CONFIG_TUNING) as AppConfigTuningKey[]).map((key): AppConfigTuningSetting => {
    const stored = prefs[key];
    const value = typeof stored === 'number' ? stored : null;
    const { min, max, unit } = APP_CONFIG_TUNING[key];
    return { key, value, effective: value ?? defaults[key], default: defaults[key], min, max, unit };
  });
  return { settings, memoryGb: Math.round(totalMemoryBytes / 1024 ** 3) };
}
