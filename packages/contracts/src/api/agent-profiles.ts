/**
 * Agent profiles: a named role (emoji, short description, instructions) bound
 * to a runtime (a coding-agent CLI) and a model.
 *
 * A profile is configuration only. It is applied on top of fields a run already
 * accepts (`agentId`, `model`, `skillIds`, `designSystemId`, `systemPrompt`), so
 * there is no separate execution engine behind it.
 */

export const AGENT_PROFILE_NAME_MAX = 60;
export const AGENT_PROFILE_ROLE_MAX = 160;
export const AGENT_PROFILE_EMOJI_MAX = 16;
export const AGENT_PROFILE_MODEL_MAX = 200;
export const AGENT_PROFILE_INSTRUCTIONS_MAX = 8000;
export const AGENT_PROFILE_SKILL_IDS_MAX = 20;

export interface AgentProfile {
  id: string;
  name: string;
  /** One line shown on the agent's card ("Design and interfaces assistant"). */
  role: string | null;
  emoji: string | null;
  /** Id of a runtime definition (`claude`, `antigravity`, ...). */
  runtimeId: string;
  /** Model id for that runtime; null keeps the CLI's own default. */
  model: string | null;
  /** Role instructions appended to the run's system prompt. */
  instructions: string | null;
  skillIds: string[];
  designSystemId: string | null;
  createdAt: number;
  updatedAt: number;
  /** Most recent activity across this agent's conversations. */
  lastActiveAt: number | null;
  conversationCount: number;
}

/** Writable fields. On update, omitted fields are left unchanged. */
export interface AgentProfileInput {
  name?: string;
  role?: string | null;
  emoji?: string | null;
  runtimeId?: string;
  model?: string | null;
  instructions?: string | null;
  skillIds?: string[];
  designSystemId?: string | null;
}

export interface AgentProfilesResponse {
  profiles: AgentProfile[];
}

export interface AgentProfileResponse {
  profile: AgentProfile;
}
