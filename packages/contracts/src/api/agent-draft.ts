/**
 * A new agent drafted from one sentence: the person says what it does, the
 * app proposes the rest, which they can change before saving.
 *   POST /api/agent-profiles/draft  { name?, description, runtimeId? } → AgentDraftResponse
 */
import type { AgentCard } from './agent-profiles.js';

export interface AgentDraftRequest {
  name?: string;
  description: string;
  runtimeId?: string;
}

export interface AgentDraftResponse {
  emoji: string;
  role: string;
  instructions: string;
  card: AgentCard;
  /** Library skills that fit the description (not the global ones, which every agent already has). */
  suggestedSkillIds: string[];
  /** `model` when a model wrote it; `basic` when none was available and it was filled from the sentence. */
  source: 'model' | 'basic';
}
