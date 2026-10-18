/**
 * The evaluation set itself, and how it is scored. The set decides what "the
 * orchestrator behaves" means, so its shape is pinned: enough cases per kind,
 * unique ids, and the scoring rules that make over-delegation visible.
 */
import { describe, expect, it } from 'vitest';

import {
  classifyOutcome,
  INTENT_CASES,
  scoreCase,
  summarize,
  type CaseKind,
} from './evals/orchestrator-intent-cases.js';

describe('orchestrator intent cases', () => {
  it('has unique ids and non-empty text', () => {
    const ids = INTENT_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const testCase of INTENT_CASES) {
      expect(testCase.text.trim().length, testCase.id).toBeGreaterThan(0);
      expect(testCase.accept.length, testCase.id).toBeGreaterThan(0);
    }
  });

  it('covers every kind with enough cases to mean something', () => {
    const kinds: CaseKind[] = ['conversation', 'task', 'explicit-delegation', 'ambiguous', 'standing-rule'];
    for (const kind of kinds) {
      expect(INTENT_CASES.filter((c) => c.kind === kind).length, kind).toBeGreaterThanOrEqual(3);
    }
    expect(INTENT_CASES.length).toBeGreaterThanOrEqual(25);
  });

  it('never accepts delegating for a conversation or an ambiguous message', () => {
    for (const testCase of INTENT_CASES) {
      if (testCase.kind === 'conversation' || testCase.kind === 'ambiguous') {
        expect(testCase.accept, testCase.id).not.toContain('delegate');
      }
    }
  });

  it('always requires delegating when the user names who should do it', () => {
    for (const testCase of INTENT_CASES.filter((c) => c.kind === 'explicit-delegation')) {
      expect(testCase.accept, testCase.id).toEqual(['delegate']);
    }
  });

  it('exercises both modes', () => {
    expect(new Set(INTENT_CASES.map((c) => c.mode))).toEqual(new Set(['chat', 'design']));
  });
});

describe('classifyOutcome', () => {
  const none = { delegateCount: 0, replyText: '', wroteRulesFile: false };

  it('calls any delegation a delegation, whatever else happened', () => {
    expect(classifyOutcome({ ...none, delegateCount: 1, replyText: '¿Algo más?', wroteRulesFile: true })).toBe(
      'delegate',
    );
  });

  it('recognises a recorded standing rule', () => {
    expect(classifyOutcome({ ...none, replyText: 'Hecho.', wroteRulesFile: true })).toBe('rule');
  });

  it('recognises a question back to the user, in Spanish or English', () => {
    expect(classifyOutcome({ ...none, replyText: 'Puedo hacerlo. ¿Abro el panel de diseño?' })).toBe('ask');
    expect(classifyOutcome({ ...none, replyText: 'Sure.\n\nShould I open the design panel?' })).toBe('ask');
  });

  it('treats a reply that only mentions a question mark mid-text as an answer', () => {
    expect(classifyOutcome({ ...none, replyText: '¿Qué es un grid? Es una rejilla de columnas.' })).toBe('answer');
  });

  it('calls a plain reply an answer, and an empty one too', () => {
    expect(classifyOutcome({ ...none, replyText: 'Hola, ¿en qué te ayudo hoy?' })).toBe('ask');
    expect(classifyOutcome({ ...none, replyText: 'Un grid suizo es una rejilla.' })).toBe('answer');
    expect(classifyOutcome(none)).toBe('answer');
  });
});

describe('scoring and summary', () => {
  const find = (id: string) => INTENT_CASES.find((c) => c.id === id)!;

  it('passes a case whose outcome is acceptable and fails one that is not', () => {
    expect(scoreCase(find('conv-greeting'), { delegateCount: 0, replyText: 'Hola', wroteRulesFile: false }).passed).toBe(
      true,
    );
    // The reply a real CLI gave to "hola": a courtesy question is still not orchestration.
    expect(
      scoreCase(find('conv-greeting'), {
        delegateCount: 0,
        replyText: '¿En qué puedo ayudarte hoy con tu proyecto o prototipo?',
        wroteRulesFile: false,
      }).passed,
    ).toBe(true);
    expect(scoreCase(find('conv-greeting'), { delegateCount: 1, replyText: '', wroteRulesFile: false }).passed).toBe(
      false,
    );
    // A design request from the chat may be answered with the panel question.
    expect(
      scoreCase(find('task-landing'), { delegateCount: 0, replyText: '¿Abro el panel?', wroteRulesFile: false }).passed,
    ).toBe(true);
  });

  it('reports accuracy per kind and singles out over- and under-delegation', () => {
    const results = [
      scoreCase(find('conv-greeting'), { delegateCount: 1, replyText: '', wroteRulesFile: false }),
      scoreCase(find('conv-thanks'), { delegateCount: 0, replyText: 'de nada', wroteRulesFile: false }),
      scoreCase(find('explicit-qa'), { delegateCount: 0, replyText: 'ok', wroteRulesFile: false }),
      scoreCase(find('explicit-dev'), { delegateCount: 2, replyText: '', wroteRulesFile: false }),
    ];

    const summary = summarize(results);

    expect(summary.total).toBe(4);
    expect(summary.passed).toBe(2);
    expect(summary.accuracy).toBe(0.5);
    expect(summary.byKind.conversation).toEqual({ total: 2, passed: 1 });
    expect(summary.overDelegations).toEqual(['conv-greeting']);
    expect(summary.underDelegations).toEqual(['explicit-qa']);
  });

  it('does not divide by zero on an empty run', () => {
    expect(summarize([]).accuracy).toBe(0);
  });
});
