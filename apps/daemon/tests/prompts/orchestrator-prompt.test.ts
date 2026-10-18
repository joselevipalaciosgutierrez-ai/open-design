/**
 * The orchestrator directive must reach BOTH prompt implementations. The legacy
 * stack and OD Next share no composition floor (docs/prompt-composition.md), so
 * each is asserted on its own, through the daemon's `composeSystemPrompt`.
 */
import { describe, expect, it } from 'vitest';
import type { OdNextStrategyRequestRecipeV2, OrchestratorContext } from '@open-design/contracts';

import { composeSystemPrompt } from '../../src/prompts/system.js';

const orchestrator: OrchestratorContext = {
  agents: [{ id: 'design', name: 'Design', role: 'Interfaces', runtimeId: 'antigravity' }],
  limits: { maxDepth: 2, maxRunsPerTree: 8, maxConcurrentPerTree: 3, maxInstancesPerAgent: 2 },
  sessionMode: 'chat',
};

const recipe: OdNextStrategyRequestRecipeV2 = {
  recipe: 'od-next-plan-build-v2',
  strategyId: 'od-next-strategy',
  strategyVersion: '2.0.0',
  snapshotId: 'snapshot-daemon-orchestrator',
  packageHash: 'a'.repeat(64),
  taskProfileDigest: 'b'.repeat(64),
  taskProfileVersion: '2.0.0',
  taskType: 'prototype',
  executionProfile: 'filesystem',
  coreStrategy: '# Core',
  generalOrchestration: '# Orchestration',
  taskSkill: '# Prototype',
  activeStages: [
    { name: 'discovery', atoms: [{ name: 'discovery-question-form' }] },
    { name: 'plan', atoms: [{ name: 'direction-picker' }, { name: 'todo-write' }] },
    { name: 'generate', atoms: [{ name: 'file-write' }, { name: 'live-artifact' }] },
  ],
};

const DIRECTIVE = '# Orchestrator — you coordinate the user';

describe('orchestrator directive · legacy stack', () => {
  for (const [name, promptCoreVariant] of [['slim', 'slim'], ['classic', undefined]] as const) {
    for (const sessionMode of ['chat', 'design', 'plan'] as const) {
      it(`is included in ${name} ${sessionMode} runs`, () => {
        const prompt = composeSystemPrompt({
          agentId: 'antigravity',
          streamFormat: 'plain-filesystem',
          sessionMode,
          promptCoreVariant,
          orchestrator: { ...orchestrator, sessionMode },
        } as never);
        expect(prompt).toContain(DIRECTIVE);
        expect(prompt).toContain('(id: design)');
      });
    }
  }

  it('sits before the pinned role-marker guard, which stays last', () => {
    const prompt = composeSystemPrompt({
      agentId: 'antigravity',
      sessionMode: 'chat',
      promptCoreVariant: 'slim',
      orchestrator,
    } as never);
    const directiveAt = prompt.indexOf(DIRECTIVE);
    const guardAt = prompt.search(/never fabricate|role.boundary|## user/i);
    expect(directiveAt).toBeGreaterThan(-1);
    expect(guardAt).toBeGreaterThan(directiveAt);
  });

  it('is absent without an orchestrator context, and with an empty roster', () => {
    for (const value of [undefined, null, { ...orchestrator, agents: [] }]) {
      const prompt = composeSystemPrompt({
        agentId: 'antigravity',
        sessionMode: 'chat',
        promptCoreVariant: 'slim',
        orchestrator: value,
      } as never);
      expect(prompt).not.toContain(DIRECTIVE);
    }
  });
});

describe('orchestrator directive · OD Next', () => {
  it('is forwarded across the fork as a host-owned block', () => {
    const prompt = composeSystemPrompt({
      agentId: 'claude',
      sessionMode: 'chat',
      odNextStrategyRecipe: recipe,
      orchestrator,
    } as never);
    expect(prompt).toContain('<od-next-context kind="instruction" name="orchestrator">');
    expect(prompt).toContain(DIRECTIVE);
  });

  it('is absent when no orchestrator context crosses the fork', () => {
    const prompt = composeSystemPrompt({
      agentId: 'claude',
      sessionMode: 'chat',
      odNextStrategyRecipe: recipe,
    } as never);
    expect(prompt).not.toContain('name="orchestrator"');
  });
});
