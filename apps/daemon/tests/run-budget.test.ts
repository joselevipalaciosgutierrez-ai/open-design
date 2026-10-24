import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  budgetTimings,
  buildRunBudget,
  namedPromptParts,
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

describe('namedPromptParts', () => {
  const doc = [
    '# Open Design execution and security boundary\n\nrules',
    '## OD Next core strategy\n\n' + 'x'.repeat(400),
    [
      '<od-next-context kind="fact" name="runtime-selection">\n{"a":1}\n</od-next-context>',
      '<od-next-context kind="instruction" name="deck-framework">\n' + 'y'.repeat(800) + '\n</od-next-context>',
    ].join('\n\n'),
  ].join('\n\n---\n\n');

  it('names each top-level section by its heading', () => {
    const parts = namedPromptParts(doc);
    expect(parts.map((p) => p.kind)).toContain('OD Next core strategy');
    expect(parts.find((p) => p.kind === 'OD Next core strategy')!.rawBytes).toBeGreaterThan(400);
  });

  it('opens a context section into one part per named block', () => {
    const kinds = namedPromptParts(doc).map((p) => p.kind);
    expect(kinds).toContain('context: runtime-selection');
    expect(kinds).toContain('context: deck-framework');
  });

  it('accounts for every byte, so the parts add up to the whole', () => {
    const sum = namedPromptParts(doc).reduce((n, p) => n + p.rawBytes, 0);
    const separators = (doc.split('\n\n---\n\n').length - 1) * '\n\n---\n\n'.length;
    expect(sum + separators).toBeGreaterThanOrEqual(doc.length - 40);
    expect(sum).toBeLessThanOrEqual(doc.length);
  });

  it('splits by headings even when the sections are not separated by rules', () => {
    const flat = '# Alpha\n\naaa\n\n## Beta\n\n' + 'b'.repeat(200) + '\n\n### Sub of beta\n\n' + 'c'.repeat(200) + '\n\n## Gamma\n\nggg';
    const parts = namedPromptParts(flat);
    expect(parts.map((p) => p.kind)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(parts[1]!.rawBytes).toBeGreaterThan(400);
  });

  it('keeps text between context blocks under the heading it follows', () => {
    const mixed = '## Layout\n\nintro\n\n<od-next-context kind="fact" name="grid">\n' + 'g'.repeat(300) + '\n</od-next-context>\n\n## Next\n\nn';
    expect(namedPromptParts(mixed).map((p) => p.kind)).toEqual(['Layout', 'context: grid', 'Next']);
  });

  it('returns nothing for empty text', () => {
    expect(namedPromptParts('')).toEqual([]);
  });
});
