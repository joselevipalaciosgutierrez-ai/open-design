import { describe, expect, it } from 'vitest';
import { buildActivitySteps } from '../../src/runtime/chat/activity-steps';

const msg = (runStatus: string, events: any[]) => [{ role: 'assistant', runStatus, events }];

describe('buildActivitySteps', () => {
  it('shows a finished write as created and a pending one as running', () => {
    const steps = buildActivitySteps({
      locale: 'es-ES',
      messages: msg('running', [
        { kind: 'tool_use', id: 'a', name: 'Write', input: { file_path: '/p/informe.pdf' } },
        { kind: 'tool_result', toolUseId: 'a', content: '', isError: false },
        { kind: 'tool_use', id: 'b', name: 'Read', input: { file_path: '/p/x.md' } },
      ]),
    });
    expect(steps).toEqual([
      { content: 'Creado informe.pdf', mark: 'done' },
      { content: 'Leyendo x.md', mark: 'running' },
    ]);
  });

  it('marks unfinished steps stopped once the run is over and skips TodoWrite', () => {
    const steps = buildActivitySteps({
      locale: 'en',
      messages: msg('failed', [
        { kind: 'tool_use', id: 't', name: 'TodoWrite', input: { todos: [] } },
        { kind: 'tool_use', id: 'a', name: 'Write', input: { file_path: 'a.pdf' } },
      ]),
    });
    expect(steps).toEqual([{ content: 'Creating a.pdf', mark: 'stopped' }]);
  });

  it('labels an od run start as a delegation', () => {
    const steps = buildActivitySteps({
      locale: 'en',
      messages: msg('running', [
        { kind: 'tool_use', id: 'a', name: 'Bash', input: { command: 'node cli.js run start --project p' } },
      ]),
    });
    expect(steps[0]?.content).toBe('Delegating to an agent');
  });
});
