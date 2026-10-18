import { describe, expect, it } from 'vitest';
import type { AgentProfile } from '@open-design/contracts';

import { applyAgentProfileToRunBody } from '../src/agent-profile-run.js';

function profile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: 'a1',
    name: 'Design',
    role: null,
    emoji: null,
    runtimeId: 'antigravity',
    model: 'Gemini 3.5 Flash (High)',
    instructions: 'Write only under design/.',
    skillIds: ['frontend-design'],
    designSystemId: null,
    createdAt: 1,
    updatedAt: 1,
    lastActiveAt: null,
    conversationCount: 0,
    ...overrides,
  };
}

describe('applyAgentProfileToRunBody', () => {
  it('runs the conversation on the agent’s runtime and model', () => {
    const body: Record<string, unknown> = { agentId: 'claude', model: 'opus', message: 'hi' };

    applyAgentProfileToRunBody(body, profile());

    expect(body).toMatchObject({
      agentId: 'antigravity',
      model: 'Gemini 3.5 Flash (High)',
      message: 'hi',
    });
  });

  it('drops runtime-specific settings when the profile switches the runtime', () => {
    const body: Record<string, unknown> = {
      agentId: 'claude',
      model: 'opus',
      reasoning: 'high',
      serviceTier: 'fast',
    };

    applyAgentProfileToRunBody(body, profile({ model: null }));

    expect(body).toMatchObject({ agentId: 'antigravity', model: null, reasoning: null, serviceTier: null });
  });

  it('keeps the caller’s model when the profile has none and the runtime is the same', () => {
    const body: Record<string, unknown> = { agentId: 'antigravity', model: 'Gemini 3.1 Pro (High)' };

    applyAgentProfileToRunBody(body, profile({ model: null }));

    expect(body.model).toBe('Gemini 3.1 Pro (High)');
  });

  it('adds the profile’s skills to the requested ones without duplicates', () => {
    const body: Record<string, unknown> = { skillIds: ['summarize', 'frontend-design', 7] };

    applyAgentProfileToRunBody(body, profile({ skillIds: ['frontend-design', 'qa'] }));

    expect(body.skillIds).toEqual(['frontend-design', 'qa', 'summarize']);
  });

  it('prepends the role instructions to the system prompt', () => {
    const body: Record<string, unknown> = { systemPrompt: 'Existing prompt.' };

    applyAgentProfileToRunBody(body, profile());

    expect(body.systemPrompt).toBe(
      '## Agent role: Design\n\nWrite only under design/.\n\nExisting prompt.',
    );
  });

  it('sets the system prompt when the caller sent none, and leaves it alone with no instructions', () => {
    const withInstructions: Record<string, unknown> = {};
    applyAgentProfileToRunBody(withInstructions, profile());
    expect(withInstructions.systemPrompt).toBe('## Agent role: Design\n\nWrite only under design/.');

    const without: Record<string, unknown> = { systemPrompt: 'Keep me.' };
    applyAgentProfileToRunBody(without, profile({ instructions: '   ' }));
    expect(without.systemPrompt).toBe('Keep me.');
  });

  it('uses the profile’s design system only when it has one', () => {
    const keep: Record<string, unknown> = { designSystemId: 'caller-ds' };
    applyAgentProfileToRunBody(keep, profile({ designSystemId: null }));
    expect(keep.designSystemId).toBe('caller-ds');

    const override: Record<string, unknown> = { designSystemId: 'caller-ds' };
    applyAgentProfileToRunBody(override, profile({ designSystemId: 'brand-ds' }));
    expect(override.designSystemId).toBe('brand-ds');
  });
});
