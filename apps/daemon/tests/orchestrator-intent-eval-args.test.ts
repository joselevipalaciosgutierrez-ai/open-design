/** The runner's argument handling: the part that decides whether quota is spent. */
import { describe, expect, it } from 'vitest';

import { parseArgs, selectCases } from './evals/orchestrator-intent-eval.js';
import { INTENT_CASES } from './evals/orchestrator-intent-cases.js';

describe('orchestrator intent eval arguments', () => {
  it('requires a daemon url', () => {
    expect(() => parseArgs([])).toThrow('--daemon-url');
  });

  it('does not spend quota unless told to', () => {
    expect(parseArgs(['--daemon-url', 'http://127.0.0.1:1']).run).toBe(false);
    expect(parseArgs(['--daemon-url', 'http://127.0.0.1:1', '--run']).run).toBe(true);
  });

  it('reads the options, trimming a trailing slash from the url', () => {
    const options = parseArgs([
      '--daemon-url', 'http://127.0.0.1:1/', '--only', 'a, b', '--limit', '3', '--timeout-s', '60',
      '--json', 'out.json', '--min-accuracy', '0.8',
    ]);
    expect(options).toMatchObject({
      daemonUrl: 'http://127.0.0.1:1',
      only: ['a', 'b'],
      limit: 3,
      timeoutMs: 60000,
      jsonPath: 'out.json',
      minAccuracy: 0.8,
    });
  });

  it('selects by id and by limit', () => {
    expect(selectCases({ only: ['conv-greeting', 'rule-no-panel'], limit: null }).map((c) => c.id)).toEqual([
      'conv-greeting',
      'rule-no-panel',
    ]);
    expect(selectCases({ only: null, limit: 4 })).toHaveLength(4);
    expect(selectCases({ only: null, limit: null })).toHaveLength(INTENT_CASES.length);
  });
});
