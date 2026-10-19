import { describe, expect, it } from 'vitest';
import type { ProjectFile, RunDelegate } from '@open-design/contracts';

import { buildStatusPanelState, deliveryActionOf, MAX_LISTED_CHANGES } from '../../src/runtime/chat/status-panel';

function file(name: string, mtime: number, over: Partial<ProjectFile> = {}): ProjectFile {
  return { name, size: 10, mtime, kind: 'text', mime: 'text/plain', ...over } as ProjectFile;
}

function delegate(runId: string, status: RunDelegate['status'], over: Partial<RunDelegate> = {}): RunDelegate {
  return {
    runId,
    status,
    createdAt: 1,
    terminalAt: null,
    conversationId: `c-${runId}`,
    depth: 1,
    agent: { id: 'a1', name: 'Diseño', emoji: '🎨' },
    ...over,
  };
}

function todoMessage(todos: Array<{ content: string; status: string }>) {
  return {
    events: [{ kind: 'tool_use', id: 't1', name: 'TodoWrite', input: { todos } }],
  } as never;
}

const none = { messages: [], delegates: [], files: [], since: 0 };

describe('buildStatusPanelState', () => {
  it('is empty when there is nothing to show', () => {
    const state = buildStatusPanelState(none);
    expect(state).toEqual({ delivery: null, tasks: null, background: null, changes: null, isEmpty: true });
  });

  describe('tasks', () => {
    it('takes the assistant\'s latest plan, with how many are done', () => {
      const state = buildStatusPanelState({
        ...none,
        messages: [
          todoMessage([{ content: 'Old plan', status: 'pending' }]),
          todoMessage([
            { content: 'Leer el brief', status: 'completed' },
            { content: 'Diseñar el hero', status: 'in_progress' },
            { content: 'Revisar contraste', status: 'pending' },
          ]),
        ],
      });

      expect(state.tasks).toEqual({
        completed: 1,
        total: 3,
        items: [
          { content: 'Leer el brief', mark: 'done' },
          { content: 'Diseñar el hero', mark: 'running' },
          { content: 'Revisar contraste', mark: 'pending' },
        ],
      });
      expect(state.isEmpty).toBe(false);
    });

    it('marks a plan item the assistant stopped', () => {
      const state = buildStatusPanelState({
        ...none,
        messages: [todoMessage([{ content: 'x', status: 'stopped' }])],
      });
      expect(state.tasks?.items[0]?.mark).toBe('stopped');
    });

    it('has no tasks for an agent that writes no plan', () => {
      expect(buildStatusPanelState({ ...none, messages: [{ events: [] }] as never }).tasks).toBeNull();
    });
  });

  describe('background', () => {
    it('separates what is still working from what finished, oldest first', () => {
      const state = buildStatusPanelState({
        ...none,
        delegates: [
          delegate('r2', 'running', { createdAt: 5 }),
          delegate('r1', 'succeeded', { createdAt: 2 }),
          delegate('r3', 'queued', { createdAt: 3 }),
          delegate('r4', 'failed', { createdAt: 1 }),
        ],
      });

      expect(state.background?.running.map((d) => d.runId)).toEqual(['r3', 'r2']);
      expect(state.background?.finished.map((d) => d.runId)).toEqual(['r4', 'r1']);
    });

    it('is absent when nothing was delegated', () => {
      expect(buildStatusPanelState(none).background).toBeNull();
    });

    it('keeps who the agent was, for the card', () => {
      const state = buildStatusPanelState({ ...none, delegates: [delegate('r1', 'running', { agent: null })] });
      expect(state.background?.running[0]?.agent).toBeNull();
    });
  });

  describe('changes', () => {
    it('lists files changed since the conversation began, newest first', () => {
      const state = buildStatusPanelState({
        ...none,
        since: 100,
        files: [file('old.md', 50), file('a.html', 150), file('b.pdf', 300, { kind: 'pdf' })],
      });

      expect(state.changes?.count).toBe(2);
      expect(state.changes?.files.map((f) => f.name)).toEqual(['b.pdf', 'a.html']);
      expect(state.changes?.files[0]?.kind).toBe('pdf');
    });

    it('leaves out folders, dotfiles and node_modules', () => {
      const state = buildStatusPanelState({
        ...none,
        since: 0,
        files: [
          file('src', 10, { type: 'dir' }),
          file('.od-frames/a.html', 10),
          file('.hidden', 10),
          file('node_modules/x.js', 10),
          file('real.md', 10),
        ],
      });
      expect(state.changes?.files.map((f) => f.name)).toEqual(['real.md']);
    });

    it('caps the list but still counts every change', () => {
      const files = Array.from({ length: MAX_LISTED_CHANGES + 7 }, (_, i) => file(`f${i}.md`, 1000 + i));
      const state = buildStatusPanelState({ ...none, since: 0, files });
      expect(state.changes?.count).toBe(MAX_LISTED_CHANGES + 7);
      expect(state.changes?.files).toHaveLength(MAX_LISTED_CHANGES);
    });

    it('is absent when nothing changed', () => {
      expect(buildStatusPanelState({ ...none, since: 100, files: [file('old.md', 1)] }).changes).toBeNull();
    });
  });
});


describe('staged delivery in the status panel', () => {
  const stage = (id: string, status: string, name = `Etapa ${id}`) => ({
    id, name, agent: null, deliverable: null, status, notes: null,
  });
  const delivery = (stages: ReturnType<typeof stage>[]) => {
    const done = stages.filter((s) => s.status === 'done').length;
    const next = stages.find((s) => s.status !== 'done') ?? null;
    return {
      present: true, goal: 'g', stages, next, completed: done, total: stages.length,
      finished: next === null, blocked: stages.some((s) => s.status === 'blocked'), issues: [], violations: [],
    } as never;
  };
  const base = { messages: [], delegates: [], files: [], since: 0 };

  it('uses the stages as the tasks, ahead of tool-call steps', () => {
    const state = buildStatusPanelState({
      ...base,
      delivery: delivery([stage('design', 'done'), stage('build', 'running'), stage('publish', 'pending')]),
    });
    expect(state.tasks?.items.map((t) => [t.content, t.mark])).toEqual([
      ['Etapa design', 'done'], ['Etapa build', 'running'], ['Etapa publish', 'pending'],
    ]);
    expect(state.tasks?.completed).toBe(1);
  });

  it('offers nothing while a run works, continue after a checkpoint, retry when blocked', () => {
    const mid = delivery([stage('design', 'done'), stage('build', 'pending'), stage('publish', 'pending')]);
    expect(deliveryActionOf(mid, true)).toBeNull();
    expect(deliveryActionOf(mid, false)).toEqual({ kind: 'continue', stageName: 'Etapa build' });
    const blocked = delivery([stage('design', 'done'), stage('build', 'blocked'), stage('publish', 'pending')]);
    expect(deliveryActionOf(blocked, false)).toEqual({ kind: 'retry', stageName: 'Etapa build' });
  });

  it('offers publish only when everything before it is done', () => {
    expect(
      deliveryActionOf(delivery([stage('build', 'done'), stage('publish', 'pending')]), false),
    ).toEqual({ kind: 'publish' });
    expect(
      deliveryActionOf(delivery([stage('build', 'pending'), stage('publish', 'pending')]), false),
    ).toEqual({ kind: 'continue', stageName: 'Etapa build' });
    expect(deliveryActionOf(delivery([stage('publish', 'done')]), false)).toBeNull();
  });

  it('ignores a delivery that is not present', () => {
    const state = buildStatusPanelState({ ...base, delivery: { present: false, stages: [] } as never });
    expect(state.delivery).toBeNull();
  });
});

