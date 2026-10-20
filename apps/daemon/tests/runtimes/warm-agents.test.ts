import { EventEmitter } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyRunContextFile, writeRunContextFile } from '../../src/agent-access/run-context.js';
import { WarmAgentPool, warmLaunchKey, type WarmAgent } from '../../src/runtimes/warm-agents.js';

function fakeAgent(key: string): WarmAgent & { killed: boolean } {
  const child = Object.assign(new EventEmitter(), { exitCode: null as number | null, signalCode: null, pid: 4242 });
  return { key, child: child as never, processGroupId: null, logFilePath: '/tmp/warm.log', startedAt: 0, killed: false };
}

function pool() {
  const killed: WarmAgent[] = [];
  return { killed, pool: new WarmAgentPool({ idleMs: 1000, kill: (agent) => killed.push(agent) }) };
}

const launch = {
  command: 'sandbox-exec',
  args: ['-p', '(profile)', 'agy', '--log-file', '/tmp/od-agy-run-1.log', '--conversation', 'c1'],
  env: { PATH: '/bin', OD_RUN_ID: 'run-1', OD_TOOL_TOKEN: 'secret-1', OD_PROJECT_ID: 'p1' },
  cwd: '/projects/p1',
};

afterEach(() => vi.useRealTimers());

describe('warmLaunchKey', () => {
  it('is the same for two runs of one launch', () => {
    const next = {
      ...launch,
      args: launch.args.map((a) => (a === '/tmp/od-agy-run-1.log' ? '/tmp/od-agy-warm-x.log' : a)),
      env: { ...launch.env, OD_RUN_ID: '', OD_TOOL_TOKEN: '', OD_RUN_CONTEXT_FILE: '/runs/agent/run-context.json' },
    };
    expect(warmLaunchKey(next)).toBe(warmLaunchKey(launch));
  });

  it('changes with anything that shapes the launch', () => {
    const base = warmLaunchKey(launch);
    expect(warmLaunchKey({ ...launch, args: [...launch.args, '--effort', 'high'] })).not.toBe(base);
    expect(warmLaunchKey({ ...launch, args: ['-p', '(other profile)', ...launch.args.slice(2)] })).not.toBe(base);
    expect(warmLaunchKey({ ...launch, env: { ...launch.env, OD_PROJECT_ID: 'p2' } })).not.toBe(base);
    expect(warmLaunchKey({ ...launch, cwd: '/projects/p2' })).not.toBe(base);
  });
});

describe('WarmAgentPool', () => {
  it('hands the parked process to the next run when the launch matches', () => {
    const { pool: warm, killed } = pool();
    const gen = warm.take('c1', 'k');
    expect(gen).toBeNull();
    const agent = fakeAgent('k');
    expect(warm.park('c1', warm.generation('c1'), agent)).toBe(true);
    expect(warm.take('c1', 'k')).toBe(agent);
    expect(killed).toEqual([]);
    expect(warm.size).toBe(0);
  });

  it('ends the parked process and starts cold when the launch changed', () => {
    const { pool: warm, killed } = pool();
    const agent = fakeAgent('k');
    warm.park('c1', warm.generation('c1'), agent);
    expect(warm.take('c1', 'other')).toBeNull();
    expect(killed).toEqual([agent]);
  });

  it('refuses a park for a turn that a newer run already replaced', () => {
    const { pool: warm, killed } = pool();
    const generation = warm.generation('c1');
    warm.take('c1', 'k'); // the next run started before the warm process was ready
    const late = fakeAgent('k');
    expect(warm.park('c1', generation, late)).toBe(false);
    expect(killed).toEqual([late]);
  });

  it('ends a process left idle, and forgets one that exits on its own', () => {
    vi.useFakeTimers();
    const { pool: warm, killed } = pool();
    const idle = fakeAgent('k');
    warm.park('c1', warm.generation('c1'), idle);
    vi.advanceTimersByTime(1001);
    expect(killed).toEqual([idle]);

    const dying = fakeAgent('k');
    warm.park('c2', warm.generation('c2'), dying);
    (dying.child as unknown as EventEmitter).emit('exit', 1);
    expect(warm.size).toBe(0);
  });

  it('ends everything when the daemon stops', () => {
    const { pool: warm, killed } = pool();
    warm.park('c1', warm.generation('c1'), fakeAgent('a'));
    warm.park('c2', warm.generation('c2'), fakeAgent('b'));
    warm.closeAll();
    expect(killed).toHaveLength(2);
    expect(warm.size).toBe(0);
  });
});

describe('run context file', () => {
  it('gives an agent started ahead of time the identity of the run that adopted it', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'od-run-context-'));
    const file = await writeRunContextFile(dir, { runId: 'run-7', toolToken: 'token-7' });
    const env: NodeJS.ProcessEnv = { OD_RUN_CONTEXT_FILE: file, OD_RUN_ID: '', OD_TOOL_TOKEN: '' };
    applyRunContextFile(env);
    expect(env.OD_RUN_ID).toBe('run-7');
    expect(env.OD_TOOL_TOKEN).toBe('token-7');
  });

  it('leaves the environment alone when there is no context yet', () => {
    const env: NodeJS.ProcessEnv = { OD_RUN_CONTEXT_FILE: path.join(os.tmpdir(), 'od-none', 'run-context.json'), OD_RUN_ID: 'run-1' };
    applyRunContextFile(env);
    expect(env.OD_RUN_ID).toBe('run-1');
  });
});
