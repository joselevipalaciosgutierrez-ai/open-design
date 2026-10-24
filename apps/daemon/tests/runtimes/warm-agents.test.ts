import { EventEmitter } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyRunContextFile, writeRunContextFile } from '../../src/agent-access/run-context.js';
import {
  WARM_AGENT_IDLE_MS,
  WARM_AGENT_MAX_PARKED_CEILING,
  WARM_AGENT_MAX_PARKED_FLOOR,
  defaultMaxParked,
  WarmAgentPool,
  warmLaunchKey,
  type WarmAgent,
} from '../../src/runtimes/warm-agents.js';

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

describe('WarmAgentPool · parked limit', () => {
  // A parked process only saves a start-up (~5 s); it holds ~125-225 MB while it
  // waits. The cap bounds what waiting costs without touching running tasks.
  function capped(maxParked: number) {
    const killed: WarmAgent[] = [];
    return { killed, pool: new WarmAgentPool({ idleMs: 1000, maxParked, kill: (agent) => killed.push(agent) }) };
  }

  it('waits three minutes by default', () => {
    expect(WARM_AGENT_IDLE_MS).toBe(3 * 60 * 1000);
  });

  const GB = 1024 ** 3;

  it('allows one parked process per 4 GB of memory, never fewer than two', () => {
    expect(WARM_AGENT_MAX_PARKED_FLOOR).toBe(2);
    expect(defaultMaxParked(4 * GB)).toBe(2);
    expect(defaultMaxParked(8 * GB)).toBe(2);
    expect(defaultMaxParked(16 * GB)).toBe(4);
    expect(defaultMaxParked(18 * GB)).toBe(4);
    expect(defaultMaxParked(32 * GB)).toBe(8);
  });

  it('stops growing at a ceiling, and survives a nonsense memory reading', () => {
    expect(defaultMaxParked(512 * GB)).toBe(WARM_AGENT_MAX_PARKED_CEILING);
    expect(WARM_AGENT_MAX_PARKED_CEILING).toBe(16);
    expect(defaultMaxParked(0)).toBe(2);
    expect(defaultMaxParked(Number.NaN)).toBe(2);
  });

  it('a pool with no explicit limit uses the memory-based one', () => {
    const killed: WarmAgent[] = [];
    const small = new WarmAgentPool({ totalMemoryBytes: 8 * GB, kill: (a) => killed.push(a) });
    const big = new WarmAgentPool({ totalMemoryBytes: 32 * GB, kill: (a) => killed.push(a) });
    for (let i = 0; i < 10; i += 1) {
      small.park(`c${i}`, small.generation(`c${i}`), fakeAgent('k'));
      big.park(`c${i}`, big.generation(`c${i}`), fakeAgent('k'));
    }
    expect(small.size).toBe(2);
    expect(big.size).toBe(8);
  });

  it('ends the oldest parked process when a new one would exceed the limit', () => {
    const { pool, killed } = capped(2);
    const a = fakeAgent('k');
    const b = fakeAgent('k');
    const c = fakeAgent('k');
    expect(pool.park('c1', pool.generation('c1'), a)).toBe(true);
    expect(pool.park('c2', pool.generation('c2'), b)).toBe(true);
    expect(pool.park('c3', pool.generation('c3'), c)).toBe(true);
    expect(pool.size).toBe(2);
    expect(killed).toEqual([a]);
    expect(pool.take('c1', 'k')).toBeNull();
    expect(pool.take('c2', 'k')).toBe(b);
    expect(pool.take('c3', 'k')).toBe(c);
  });

  it('parking again for the same conversation never evicts another conversation', () => {
    const { pool, killed } = capped(2);
    const a = fakeAgent('k');
    const b = fakeAgent('k');
    const a2 = fakeAgent('k');
    pool.park('c1', pool.generation('c1'), a);
    pool.park('c2', pool.generation('c2'), b);
    pool.park('c1', pool.generation('c1'), a2);
    expect(pool.size).toBe(2);
    expect(killed).toEqual([a]);
    expect(pool.take('c2', 'k')).toBe(b);
  });

  it('a limit of zero parks nothing and ends the process', () => {
    const { pool, killed } = capped(0);
    const a = fakeAgent('k');
    expect(pool.park('c1', pool.generation('c1'), a)).toBe(false);
    expect(killed).toEqual([a]);
    expect(pool.size).toBe(0);
  });

  it('lowering the limit at run time ends the oldest ones at once', () => {
    const { pool, killed } = capped(3);
    const [a, b, c] = [fakeAgent('k'), fakeAgent('k'), fakeAgent('k')];
    pool.park('c1', pool.generation('c1'), a);
    pool.park('c2', pool.generation('c2'), b);
    pool.park('c3', pool.generation('c3'), c);
    pool.configure({ maxParked: 1 });
    expect(pool.size).toBe(1);
    expect(killed).toEqual([a, b]);
  });

  it('a new wait applies to processes parked after the change', () => {
    vi.useFakeTimers();
    const { pool, killed } = capped(2);
    const a = fakeAgent('k');
    pool.park('c1', pool.generation('c1'), a);
    pool.configure({ idleMs: 50 });
    const b = fakeAgent('k');
    pool.park('c2', pool.generation('c2'), b);
    vi.advanceTimersByTime(60);
    expect(killed).toEqual([b]);
    vi.advanceTimersByTime(1000);
    expect(killed).toEqual([b, a]);
  });

  it('never limits the runs that take a parked process or start cold', () => {
    const { pool } = capped(1);
    const a = fakeAgent('k');
    pool.park('c1', pool.generation('c1'), a);
    for (let i = 0; i < 10; i += 1) expect(pool.take(`other-${i}`, 'k')).toBeNull();
    expect(pool.take('c1', 'k')).toBe(a);
  });
});
