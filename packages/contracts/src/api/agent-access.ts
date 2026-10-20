/**
 * What the agents may touch on this Mac. The daemon enforces it with a macOS
 * sandbox around every agent process (not with prompt text), so an agent
 * cannot widen it: the settings are only reachable from the app, never from
 * an agent run.
 */
export interface AgentAccessSettings {
  /** Folders, besides the project's own, the agents may write in. Absolute paths. */
  allowedDirs: string[];
  /**
   * Whether the agents may read the person's files anywhere (Desktop,
   * Documents, Downloads...). Secrets (keys, keychains, browser data, mail,
   * messages) stay unreadable either way.
   */
  readWholeMac: boolean;
  /** Whether the agents may open apps, type, press keys, click and take screenshots. */
  macControl: boolean;
}

export const DEFAULT_AGENT_ACCESS: AgentAccessSettings = {
  allowedDirs: [],
  readWholeMac: true,
  macControl: false,
};

/** `GET /api/agent-access` and the answer to `PUT /api/agent-access`. */
export interface AgentAccessResponse {
  access: AgentAccessSettings;
  /** False off macOS, or when `OD_AGENT_SANDBOX=off`: nothing is enforced. */
  enforced: boolean;
  /** Paths `PUT` refused, with why (missing, not a folder, a system folder). */
  refused?: Array<{ path: string; reason: string }>;
}

export type UpdateAgentAccessRequest = Partial<AgentAccessSettings>;

/** `GET /api/mac/status`. */
export interface MacControlStatus {
  enabled: boolean;
  supported: boolean;
  /** Whether macOS lets the app control other apps (Accessibility). Null if unknown. */
  accessibility: boolean | null;
}

export type MacControlAction =
  | { action: 'open'; app?: string; url?: string }
  | { action: 'type'; text: string }
  | { action: 'key'; combo: string }
  | { action: 'click'; x: number; y: number }
  | { action: 'screenshot' }
  | { action: 'front-app' };

/** `POST /api/mac/act`. */
export interface MacControlResult {
  ok: boolean;
  /** For `screenshot`: the PNG's path. For `front-app`: the app's name. */
  value?: string;
  error?: string;
}
