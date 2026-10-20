import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  budgetTimings,
  buildRunBudget,
  readRunBudget,
  recordRunBudgetTimings,
  writeRunBudget,
} from '../src/run-budget.js';

const base = {
  runId: 'run-1',
  agentId: 'antigravity',
  model: null,
  resumed: false,
  rulesResent: true,
  historyCompacted: false,
};

describe('buildRunBudget', () => {
  it('splits the prompt into parts that add up to the total', () => {
    const budget = buildRunBudget({
      ...base,
      composedPrompt: 'r'.repeat(4000) + 's'.repeat(800) + 'd'.repeat(400) + 'h'.repeat(1200) + 'm'.repeat(400),
      userRequest: 'h'.repeat(1200) + 'm'.repeat(400),
      currentMessage: 'm'.repeat(400),
      skills: ['s'.repeat(800), null],
      designSystem: 'd'.repeat(400),
    });
    expect(budget.sent).toEqual({ rules: 1000, skills: 200, designSystem: 100, history: 300, message: 100, total: 1700 });
  });

  it('counts the whole request as the message when there is no separate one', () => {
    const budget = buildRunBudget({ ...base, composedPrompt: 'x'.repeat(800), userRequest: 'x'.repeat(400), currentMessage: null, skills: [], designSystem: null });
    expect(budget.sent.history).toBe(0);
    expect(budget.sent.message).toBe(100);
  });
});

describe('budget sections', () => {
  const sections = [
    { kind: 'daemonSystemPrompt', rawBytes: 4000 },
    { kind: 'clientSystemPrompt', rawBytes: 800 },
  ];
  it('lists every section on a turn that sent the rules', () => {
    const budget = buildRunBudget({ ...base, composedPrompt: 'x', userRequest: '', currentMessage: null, skills: [], designSystem: null, sections });
    expect(budget.sections?.map((s) => s.kind)).toEqual(['daemonSystemPrompt', 'clientSystemPrompt']);
  });
  it('leaves out the stable sections a resumed session already had', () => {
    const budget = buildRunBudget({ ...base, rulesResent: false, composedPrompt: 'x', userRequest: '', currentMessage: null, skills: [], designSystem: null, sections });
    expect(budget.sections?.map((s) => s.kind)).toEqual(['clientSystemPrompt']);
  });
});

describe('budgetTimings', () => {
  it('turns lifecycle marks into phase durations', () => {
    expect(
      budgetTimings({ startChatRunStartedAt: 1000, promptBuildEndAt: 1200, processSpawnedAt: 1500, firstTokenAt: 4000 }, 9000),
    ).toEqual({ prepareMs: 200, launchMs: 300, firstTokenMs: 2500, totalMs: 8000 });
  });

  it('leaves out phases it cannot measure', () => {
    expect(budgetTimings({}, 10)).toEqual({});
  });
});

describe('budget file', () => {
  it('is written, completed with timings, and read back', async () => {
    const dir = path.join(await mkdtemp(path.join(os.tmpdir(), 'od-budget-')), 'run-1');
    await writeRunBudget(dir, buildRunBudget({ ...base, composedPrompt: 'abcd', userRequest: 'ab', currentMessage: 'ab', skills: [], designSystem: null }));
    await recordRunBudgetTimings(dir, { startChatRunStartedAt: Date.now() - 50 });
    const read = await readRunBudget(dir);
    expect(read?.runId).toBe('run-1');
    expect(read?.timings?.totalMs).toBeGreaterThanOrEqual(0);
  });

  it('reads as null when the run left none', async () => {
    expect(await readRunBudget(path.join(os.tmpdir(), 'od-budget-none'))).toBeNull();
  });
});
