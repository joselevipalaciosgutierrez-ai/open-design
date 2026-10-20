/**
 * Drafting a new agent from one sentence (POST /api/agent-profiles/draft).
 * One short model call writes the icon, role, card and base instructions;
 * skills are suggested by matching the sentence against the library, with no
 * model. With no model available the draft is filled from the sentence, so
 * creating an agent never depends on one.
 */
import type { AgentDraftResponse } from '@open-design/contracts';

import { skillRelevance } from './agent-access/skill-index.js';

export interface DraftSkill {
  id: string;
  name: string;
  description: string;
  triggers?: unknown[];
}

const MAX_SUGGESTED = 4;

/** Library skills whose words meet the description, best first; global ones are left out. */
export function suggestSkillsFor(description: string, library: DraftSkill[], globalIds: string[]): string[] {
  const global = new Set(globalIds);
  return library
    .filter((skill) => !global.has(skill.id))
    .map((skill) => ({ id: skill.id, score: skillRelevance({ ...skill, scope: 'agent' }, description) }))
    .filter(({ score }) => score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUGGESTED)
    .map(({ id }) => id);
}

export const AGENT_DRAFT_SYSTEM = [
  "You set up an agent in a design-and-build app from the person's one-sentence description.",
  'Reply with JSON only, no prose, in the language of the description:',
  '{"emoji": one emoji, "role": one line under 60 characters, "goodFor": what to send it with 3-5 concrete examples (under 160 characters), "notFor": what not to send it (under 100 characters), "delivers": what it hands back (under 70 characters), "instructions": 2-4 short sentences that tell the agent how to work}',
  'Be concrete and faithful to the description; do not invent abilities it did not mention.',
].join('\n');

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.replace(/\s+/g, ' ').trim().slice(0, max) : null;
}

/** The model's reply as a draft, or null when it is not the JSON asked for. */
export function parseDraftReply(raw: string | null): Omit<AgentDraftResponse, 'suggestedSkillIds' | 'source'> | null {
  if (!raw) return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const role = text(parsed.role, 80);
  const goodFor = text(parsed.goodFor, 240);
  if (!role || !goodFor) return null;
  return {
    emoji: text(parsed.emoji, 8) ?? '🤖',
    role,
    instructions: text(parsed.instructions, 800) ?? '',
    card: { goodFor, notFor: text(parsed.notFor, 160), delivers: text(parsed.delivers, 120) },
  };
}

/** A draft made from the sentence alone, when no model is available. */
export function basicDraft(description: string): Omit<AgentDraftResponse, 'suggestedSkillIds' | 'source'> {
  const sentence = description.replace(/\s+/g, ' ').trim();
  const firstClause = sentence.split(/[.;:]/)[0] ?? sentence;
  return {
    emoji: '🤖',
    role: firstClause.slice(0, 80),
    instructions: '',
    card: { goodFor: sentence.slice(0, 240), notFor: null, delivers: null },
  };
}
