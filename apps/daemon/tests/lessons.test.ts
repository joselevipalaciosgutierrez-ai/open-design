import { describe, expect, it } from 'vitest';

import {
  forgetStale,
  LESSON_FORGET_AFTER_MS,
  lessonsForTurn,
  recordLesson,
  renderLessonsPrompt,
  similarity,
} from '../src/lessons.js';

const RULE = 'Run pnpm install before building this project';

describe('recording a lesson', () => {
  it('starts narrow: this project and this agent', () => {
    const { lesson, outcome } = recordLesson([], { rule: RULE, agentKey: 'design', projectId: 'p1', runId: 'r1' });
    expect(outcome).toBe('new');
    expect(lesson).toMatchObject({ scope: 'project', projectIds: ['p1'], agentKeys: ['design'], confirmations: 1 });
  });

  it('confirms a matching lesson instead of copying it', () => {
    const first = recordLesson([], { rule: RULE, agentKey: 'design', projectId: 'p1' });
    const second = recordLesson(first.lessons, { rule: 'run pnpm install before building the project', agentKey: 'design', projectId: 'p1' });
    expect(second.outcome).toBe('confirmed');
    expect(second.lessons).toHaveLength(1);
    expect(second.lesson.confirmations).toBe(2);
  });

  it('widens only when it recurs: another project makes it the agent\'s, another agent everyone\'s', () => {
    let state = recordLesson([], { rule: RULE, agentKey: 'design', projectId: 'p1' }).lessons;
    let step = recordLesson(state, { rule: RULE, agentKey: 'design', projectId: 'p2' });
    expect(step.lesson.scope).toBe('agent');
    state = step.lessons;
    step = recordLesson(state, { rule: RULE, agentKey: 'dev', projectId: 'p3' });
    expect(step.lesson.scope).toBe('global');
  });

  it('keeps different lessons apart', () => {
    expect(similarity(RULE, 'Never use stock photos in this brand')).toBeLessThan(0.3);
  });
});

describe('which lessons reach a turn', () => {
  it('brings standing rules always, and others only when they meet the message, within the ceiling', () => {
    let lessons = recordLesson([], { rule: RULE, agentKey: 'design', projectId: 'p1' }).lessons;
    lessons = recordLesson(lessons, { rule: RULE, agentKey: 'design', projectId: 'p1' }).lessons;
    lessons = recordLesson(lessons, { rule: RULE, agentKey: 'design', projectId: 'p1' }).lessons; // ×3: standing
    lessons = recordLesson(lessons, { rule: 'Export the hero image as webp', agentKey: 'design', projectId: 'p9' }).lessons;
    const unrelated = lessonsForTurn(lessons, 'design', 'p1', 'change the title colour');
    expect(unrelated.map((l) => l.rule)).toEqual([RULE]);
    const elsewhere = lessonsForTurn(lessons, 'design', 'p2', 'change the title colour');
    expect(elsewhere).toEqual([]);
    expect(renderLessonsPrompt(unrelated)).toContain(`- ${RULE}`);
  });

  it('never hands one agent\'s project lesson to another agent', () => {
    const lessons = recordLesson([], { rule: RULE, agentKey: 'design', projectId: 'p1' }).lessons;
    expect(lessonsForTurn(lessons, 'dev', 'p1', 'pnpm install build')).toEqual([]);
  });
});

describe('forgetting', () => {
  it('drops lessons unused for 60 days but keeps standing rules', () => {
    const now = Date.now();
    let lessons = recordLesson([], { rule: RULE, agentKey: 'a', projectId: 'p1', now: 0 }).lessons;
    lessons = recordLesson(lessons, { rule: 'Use the brand serif for headings', agentKey: 'a', projectId: 'p1', now: 0 }).lessons;
    lessons = recordLesson(lessons, { rule: 'Use the brand serif for headings', agentKey: 'a', projectId: 'p1', now: 0 }).lessons;
    lessons = recordLesson(lessons, { rule: 'Use the brand serif for headings', agentKey: 'a', projectId: 'p1', now: 0 }).lessons;
    const kept = forgetStale(lessons, now + LESSON_FORGET_AFTER_MS);
    expect(kept.map((l) => l.rule)).toEqual(['Use the brand serif for headings']);
  });
});
