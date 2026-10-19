import { describe, expect, it } from 'vitest';
import { buildActivitySteps } from '../../src/runtime/chat/activity-steps';

const msg = (runStatus: string, events: any[]) => [{ role: 'assistant', runStatus, events }];
const use = (id: string, name: string, input: unknown) => ({ kind: 'tool_use', id, name, input });
const done = (id: string) => ({ kind: 'tool_result', toolUseId: id, content: '', isError: false });

describe('buildActivitySteps', () => {
  it('says what the work is about, not what the tool literally ran', () => {
    const steps = buildActivitySteps({
      locale: 'es-ES',
      messages: msg('succeeded', [
        use('a', 'run_command', { CommandLine: 'python make_pdf.py --name Levi' }),
        done('a'),
        use('b', 'view_file', { AbsolutePath: '/p/Levi.pdf' }),
        done('b'),
        use('c', 'write_to_file', { TargetFile: '/p/levi.pdf' }),
        done('c'),
      ]),
    });
    expect(steps.map((s) => s.content)).toEqual(['Procesado', 'Revisado PDF', 'Creado PDF']);
  });

  it('drops host plumbing and scratch briefs', () => {
    const steps = buildActivitySteps({
      locale: 'es',
      messages: msg('succeeded', [
        use('a', 'run_command', { CommandLine: 'echo "NODE: $OD_NODE_BIN"' }),
        done('a'),
        use('b', 'write_to_file', { TargetFile: '/p/scratch/brief.txt' }),
        done('b'),
        use('c', 'write_to_file', { TargetFile: '/p/levi.pdf' }),
        done('c'),
      ]),
    });
    expect(steps.map((s) => s.content)).toEqual(['Creado PDF']);
  });

  it('folds repeats of the same step into one and keeps it running while any call is', () => {
    const steps = buildActivitySteps({
      locale: 'en',
      messages: msg('running', [
        use('a', 'view_file', { AbsolutePath: '/p/a.pdf' }),
        done('a'),
        use('b', 'view_file', { AbsolutePath: '/p/b.pdf' }),
      ]),
    });
    expect(steps).toEqual([{ content: 'Reviewing PDF', mark: 'running' }]);
  });

  it('shows an od run start as coordinating agents', () => {
    const steps = buildActivitySteps({
      locale: 'en',
      messages: msg('running', [use('a', 'Bash', { command: 'node cli.js run start --project p' })]),
    });
    expect(steps).toEqual([{ content: 'Coordinating agents', mark: 'running' }]);
  });

  it('marks unfinished steps stopped once the run is over and skips TodoWrite', () => {
    const steps = buildActivitySteps({
      locale: 'en',
      messages: msg('failed', [
        use('t', 'TodoWrite', { todos: [] }),
        use('a', 'Write', { file_path: 'a.pdf' }),
      ]),
    });
    expect(steps).toEqual([{ content: 'Creating PDF', mark: 'stopped' }]);
  });
});
