import type { OdNextRolloutMode } from './strategy-rollout.js';

export interface AgentModelPrefs {
  model?: string;
  reasoning?: string;
  serviceTier?: string;
}

export type AgentCliEnvPrefs = Record<string, Record<string, string>>;
export type AgentCliEnvIntentPrefs = Record<string, { apiKeyOverride?: boolean }>;

export interface TelemetryPrefs {
  metrics?: boolean;
  content?: boolean;
  artifactManifest?: boolean;
}

export interface OrbitConfigPrefs {
  enabled: boolean;
  /** Local 24-hour clock time in HH:mm format. Defaults to 08:00. */
  time: string;
  /** Optional skill id from the examples gallery where scenario === "orbit". */
  templateSkillId?: string | null;
  /**
   * Workspace selected in the tab that configured Orbit. The daemon verifies
   * this pair when saving and again before every unattended run.
   */
  workspaceScope?: AutomationWorkspaceScope | null;
}

export interface AutomationWorkspaceScope {
  workspaceId: string;
  workspaceMemberId: string;
}

export interface ProjectLocationPrefs {
  id: string;
  name: string;
  path: string;
}

export interface AppConfigPrefs {
  onboardingCompleted?: boolean;
  agentId?: string | null;
  agentModels?: Record<string, AgentModelPrefs>;
  agentCliEnv?: AgentCliEnvPrefs;
  agentCliEnvIntent?: AgentCliEnvIntentPrefs;
  skillId?: string | null;
  designSystemId?: string | null;
  disabledSkills?: string[];
  disabledDesignSystems?: string[];
  installationId?: string | null;
  telemetry?: TelemetryPrefs;
  /**
   * Unix-millis timestamp of when the user resolved the first-run privacy
   * consent surface (Share or Decline). Set on first decision and on
   * subsequent toggles in Settings → Privacy. Independent of
   * installationId so that "Delete my data" can rotate the id without
   * re-popping the consent banner.
   */
  privacyDecisionAt?: number | null;
  allowSilentUpdates?: boolean;
  /** Lev Island: the companion on the Mac's notch (macOS only). Off unless turned on. */
  levIsland?: boolean;
  /**
   * Antigravity processes the daemon keeps ready for a conversation's next turn,
   * all conversations together; 0 keeps none. Integer 0-16. Absent means the
   * daemon's default: one per 4 GB of memory, between 2 and 16. Changing it needs
   * no restart. It limits waiting processes, never running tasks.
   */
  antigravityWarmMax?: number;
  /** Seconds a ready Antigravity process waits for its next turn. Integer 5-3600; absent means 180. */
  antigravityWarmIdleSeconds?: number;
  orbit?: OrbitConfigPrefs;
  customInstructions?: string | null;
  /** External project library roots. The daemon adds its built-in .od/projects location at read time. */
  projectLocations?: ProjectLocationPrefs[];
  /** Project location id used for new projects when the create request does not choose one explicitly. */
  defaultProjectLocationId?: string | null;
  /**
   * Which mode this installation runs the OD Next design strategy in.
   *
   * OD Next is the default route: an installation that never chose runs the
   * strategy, so absent (and `null`) mean `active`. Setting this to `'off'` is
   * the whole opt-out step — the next run takes the ordinary route without
   * restarting the daemon, because the run route reads this field per request
   * rather than latching it at boot.
   *
   * A packaged install has no other control: the packaged child environment
   * allowlist carries no `OD_NEXT_*` key, so this field is what the Labs
   * switch writes and the only thing standing between an opted-out user and
   * the default.
   *
   * `OD_NEXT_STRATEGY_ROLLOUT` still outranks this when it is set, so an
   * operator, a packaged smoke run, or a test can pin a mode for one process
   * without overwriting what the user saved.
   */
  odNextStrategyMode?: OdNextRolloutMode | null;
  /**
   * Most-recently-used local working directories the user granted the agent
   * read access to (via the Home composer's working-directory picker). These
   * become a new project's `metadata.linkedDirs` — the agent perceives them
   * through `--add-dir`; they are NOT imported into Design Files. Stored
   * most-recent-first and capped by the daemon.
   */
  recentLinkedDirs?: string[];
}

export interface AppConfigResponse {
  config: AppConfigPrefs;
}

export type UpdateAppConfigRequest = Partial<AppConfigPrefs>;

/**
 * Response body for `DELETE /api/app-config/:key`, the way to remove a preference
 * so its default applies again (`PUT /api/app-config` only merges the keys it is
 * sent). `removed` is false when the key was not set. The daemon refuses keys that
 * are not preferences, and the ones whose removal would change consent, identity
 * or credentials (`telemetry`, `privacyDecisionAt`, `installationId`,
 * `agentCliEnv`, `agentCliEnvIntent`), with a 400 and code
 * `INVALID_APP_CONFIG_VALUE`.
 */
export interface UnsetAppConfigResponse {
  config: AppConfigPrefs;
  removed: boolean;
}

/** Response body for `GET /api/recent-dirs` — recent working directories
 *  pruned to those that still exist on disk, most-recent-first. */
export interface RecentLinkedDirsResponse {
  dirs: string[];
}

/**
 * Preferences that tune how much the machine spends, as opposed to what the
 * product does. One declaration feeds the daemon's validation, `od config describe`
 * and the Settings panel, so a range or a unit changes in one place.
 */
export const APP_CONFIG_TUNING = {
  antigravityWarmMax: { min: 0, max: 16, unit: 'processes' },
  antigravityWarmIdleSeconds: { min: 5, max: 3600, unit: 'seconds' },
} as const;

export type AppConfigTuningKey = keyof typeof APP_CONFIG_TUNING;

/** One tuning preference as `GET /api/app-config/tuning` reports it. */
export interface AppConfigTuningSetting {
  key: AppConfigTuningKey;
  /** What is stored; `null` when nothing is, so the default applies. */
  value: number | null;
  /** What applies right now: the stored value, or the default. */
  effective: number;
  /** What applies when nothing is stored (for the process limit it depends on the machine's memory). */
  default: number;
  min: number;
  max: number;
  unit: 'processes' | 'seconds';
}

export interface AppConfigTuningResponse {
  settings: AppConfigTuningSetting[];
  /** Memory of the machine the daemon runs on, in whole GB: what the process-limit default is computed from. */
  memoryGb: number;
}
