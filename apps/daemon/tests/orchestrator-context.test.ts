/**
 * When the default assistant becomes the orchestrator. Every "no" here is a run
 * that must NOT be told to coordinate agents: a delegate, a run the user aimed
 * at one agent, an API run with no shell, a background job.
 */
import { describe, expect, it } from 'vitest';
import type { AgentProfile } from '@open-design/contracts';

import { resolveOrchestratorContext } from '../src/orchestrator-context.js';

function agent(id: string, over: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id,
    name: id.toUpperCase(),
    role: 'does things',
    emoji: null,
    runtimeId: 'antigravity',
    model: null,
    instructions: 'SECRET INSTRUCTIONS',
    skillIds: [],
    designSystemId: null,
    createdAt: 1,
    updatedAt: 1,
    lastActiveAt: null,
    conversationCount: 0,
    ...over,
  };
}

const chatRun = { conversationId: 'c1', delegation: null, analyticsHints: undefined };

function resolve(over: Partial<Parameters<typeof resolveOrchestratorContext>[0]> = {}) {
  return resolveOrchestratorContext({
    run: chatRun,
    conversationAgentProfileId: null,
    profiles: [agent('design')],
    sessionMode: 'chat',
    streamFormat: 'claude-stream-json',
    ...over,
  });
}

describe('resolveOrchestratorContext', () => {
  it('makes the default assistant the orchestrator when the user has agents and chose none', () => {
    const context = resolve();
    expect(context?.agents.map((a) => a.id)).toEqual(['design']);
    expect(context?.sessionMode).toBe('chat');
  });

  it('passes the daemon\'s own limits to the prompt', () => {
    expect(resolve()?.limits).toEqual({
      maxDepth: 2,
      maxRunsPerTree: 8,
      maxConcurrentPerTree: 3,
      maxInstancesPerAgent: 2,
    });
  });

  it('does not leak an agent\'s instructions into the prompt', () => {
    expect(JSON.stringify(resolve())).not.toContain('SECRET INSTRUCTIONS');
  });

  it('is off when the user has no agents', () => {
    expect(resolve({ profiles: [] })).toBeNull();
  });

  it('is off when the user selected an agent: they talk to it directly', () => {
    expect(resolve({ conversationAgentProfileId: 'design' })).toBeNull();
  });

  it('is off for a delegate, so a helper never coordinates', () => {
    const delegation = { parentRunId: 'r', rootRunId: 'r', depth: 1 };
    expect(resolve({ run: { ...chatRun, delegation } })).toBeNull();
  });

  it('is off for API/BYOK runs, which have no shell to delegate with', () => {
    expect(resolve({ streamFormat: 'plain' })).toBeNull();
  });

  it('is off for runs that are not a conversation', () => {
    expect(resolve({ run: { ...chatRun, conversationId: null } })).toBeNull();
  });

  it('is off for design-system enrichment runs', () => {
    expect(resolve({ run: { ...chatRun, analyticsHints: { dsEnrichment: true } } })).toBeNull();
  });

  it('applies in design and plan mode too', () => {
    expect(resolve({ sessionMode: 'design' })?.sessionMode).toBe('design');
    expect(resolve({ sessionMode: 'plan' })?.sessionMode).toBe('plan');
  });
});
