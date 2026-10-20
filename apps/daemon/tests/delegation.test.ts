/**
 * Delegation limits. These pin the guarantees the daemon gives an orchestrator
 * regardless of what its model does: how deep, how many in total, how many at
 * once, and that one request's tree never touches another's.
 */
import { describe, expect, it } from 'vitest';

import {
  activeDescendantsOf,
  DEFAULT_DELEGATION_LIMITS,
  evaluateDelegation,
  readRequestedParentRunId,
  treeOf,
  type DelegationRun,
} from '../src/delegation.js';

const terminal = (status: string) => ['succeeded', 'failed', 'canceled'].includes(status);

function run(
  id: string,
  over: Partial<DelegationRun> & { profile?: string | null } = {},
): DelegationRun & { profile: string | null } {
  const { profile = null, ...rest } = over;
  return { id, status: 'running', projectId: 'p1', delegation: null, profile, ...rest };
}

function decide(
  runs: Array<DelegationRun & { profile: string | null }>,
  parentRunId: string,
  over: { projectId?: string | null; target?: string | null } = {},
) {
  return evaluateDelegation({
    parentRunId,
    projectId: over.projectId === undefined ? 'p1' : over.projectId,
    targetAgentProfileId: over.target ?? null,
    getRun: (id) => runs.find((r) => r.id === id) ?? null,
    allRuns: () => runs,
    isTerminal: terminal,
    profileOf: (r) => (r as { profile?: string | null }).profile ?? null,
  });
}

/** A delegated child of `parent` in the tree rooted at `root`. */
function child(id: string, parent: string, root: string, depth: number, over = {}) {
  return run(id, { delegation: { parentRunId: parent, rootRunId: root, depth }, ...over });
}

describe('evaluateDelegation · position in the tree', () => {
  it('puts a run started by the user\'s run at depth 1 under that root', () => {
    const decision = decide([run('root')], 'root');
    expect(decision).toEqual({
      ok: true,
      delegation: { parentRunId: 'root', rootRunId: 'root', depth: 1 },
    });
  });

  it('derives the depth from the parent, so a nested run cannot claim a shallower one', () => {
    const runs = [run('root'), child('a', 'root', 'root', 1)];
    const decision = decide(runs, 'a');
    expect(decision).toEqual({
      ok: true,
      delegation: { parentRunId: 'a', rootRunId: 'root', depth: 2 },
    });
  });
});

describe('evaluateDelegation · depth', () => {
  it('refuses a run at the last level: a leaf cannot delegate again', () => {
    const runs = [run('root'), child('a', 'root', 'root', 1), child('b', 'a', 'root', 2)];
    const decision = decide(runs, 'b');
    expect(decision).toMatchObject({
      ok: false,
      status: 409,
      code: 'DELEGATION_DEPTH_EXCEEDED',
      retryable: false,
    });
  });

  it('honours a custom depth', () => {
    const decision = evaluateDelegation({
      parentRunId: 'a',
      projectId: 'p1',
      targetAgentProfileId: null,
      getRun: (id) => (id === 'a' ? child('a', 'root', 'root', 1) : null),
      allRuns: () => [run('root'), child('a', 'root', 'root', 1)],
      isTerminal: terminal,
      profileOf: () => null,
      limits: { ...DEFAULT_DELEGATION_LIMITS, maxDepth: 1 },
    });
    expect(decision).toMatchObject({ ok: false, code: 'DELEGATION_DEPTH_EXCEEDED' });
  });
});

describe('evaluateDelegation · budget and concurrency', () => {
  it('refuses once the whole tree has started its budget, finished runs included', () => {
    const runs = [run('root')];
    for (let i = 0; i < DEFAULT_DELEGATION_LIMITS.maxRunsPerTree; i += 1) {
      runs.push(child(`d${i}`, 'root', 'root', 1, { status: 'succeeded' }));
    }
    const decision = decide(runs, 'root');
    expect(decision).toMatchObject({
      ok: false,
      status: 429,
      code: 'DELEGATION_BUDGET_EXCEEDED',
      retryable: false,
    });
  });

  it('counts a sub-agent against the same tree budget as its parent\'s siblings', () => {
    const runs = [run('root'), child('a', 'root', 'root', 1)];
    for (let i = 0; i < DEFAULT_DELEGATION_LIMITS.maxRunsPerTree - 1; i += 1) {
      runs.push(child(`s${i}`, 'a', 'root', 2, { status: 'succeeded' }));
    }
    expect(decide(runs, 'a')).toMatchObject({ ok: false, code: 'DELEGATION_BUDGET_EXCEEDED' });
  });

  it('refuses when too many delegated runs are active, and says waiting helps', () => {
    const runs = [run('root')];
    for (let i = 0; i < DEFAULT_DELEGATION_LIMITS.maxConcurrentPerTree; i += 1) {
      runs.push(child(`d${i}`, 'root', 'root', 1));
    }
    expect(decide(runs, 'root')).toMatchObject({
      ok: false,
      status: 429,
      code: 'DELEGATION_CONCURRENCY_LIMIT',
      retryable: true,
    });
  });

  it('lets another run start once one has finished', () => {
    const runs = [run('root')];
    for (let i = 0; i < DEFAULT_DELEGATION_LIMITS.maxConcurrentPerTree; i += 1) {
      runs.push(child(`d${i}`, 'root', 'root', 1, i === 0 ? { status: 'succeeded' } : {}));
    }
    expect(decide(runs, 'root').ok).toBe(true);
  });

  it('does not count the root run as a delegated one', () => {
    expect(decide([run('root')], 'root').ok).toBe(true);
  });
});

describe('evaluateDelegation · one agent at a time', () => {
  it('refuses a third active instance of the same agent', () => {
    const runs = [
      run('root'),
      child('a', 'root', 'root', 1, { profile: 'design' }),
      child('b', 'root', 'root', 1, { profile: 'design' }),
    ];
    expect(decide(runs, 'root', { target: 'design' })).toMatchObject({
      ok: false,
      status: 429,
      code: 'DELEGATION_AGENT_BUSY',
      retryable: true,
    });
  });

  it('allows a second instance, and a different agent alongside', () => {
    const runs = [run('root'), child('a', 'root', 'root', 1, { profile: 'design' })];
    expect(decide(runs, 'root', { target: 'design' }).ok).toBe(true);
    expect(decide(runs, 'root', { target: 'qa' }).ok).toBe(true);
  });

  it('does not count finished instances', () => {
    const runs = [
      run('root'),
      child('a', 'root', 'root', 1, { profile: 'design', status: 'succeeded' }),
      child('b', 'root', 'root', 1, { profile: 'design' }),
    ];
    expect(decide(runs, 'root', { target: 'design' }).ok).toBe(true);
  });
});

describe('evaluateDelegation · who may delegate', () => {
  it('refuses an unknown parent', () => {
    expect(decide([run('root')], 'ghost')).toMatchObject({
      ok: false,
      status: 404,
      code: 'DELEGATION_PARENT_NOT_FOUND',
    });
  });

  it('refuses a parent that already finished', () => {
    expect(decide([run('root', { status: 'succeeded' })], 'root')).toMatchObject({
      ok: false,
      status: 409,
      code: 'DELEGATION_PARENT_FINISHED',
    });
  });

  it('keeps delegation inside one project', () => {
    expect(decide([run('root')], 'root', { projectId: 'p2' })).toMatchObject({
      ok: false,
      status: 400,
      code: 'DELEGATION_CROSS_PROJECT',
    });
  });
});

describe('independent trees', () => {
  it('lets two projects each use their own full budget at the same time', () => {
    const runs = [run('rootA', { projectId: 'pA' }), run('rootB', { projectId: 'pB' })];
    for (let i = 0; i < DEFAULT_DELEGATION_LIMITS.maxConcurrentPerTree; i += 1) {
      runs.push(child(`a${i}`, 'rootA', 'rootA', 1, { projectId: 'pA' }));
    }
    // Tree A is saturated; tree B is untouched by it.
    expect(decide(runs, 'rootA', { projectId: 'pA' }).ok).toBe(false);
    expect(decide(runs, 'rootB', { projectId: 'pB' }).ok).toBe(true);
  });

  it('treeOf only returns one root\'s runs', () => {
    const runs = [run('r1'), run('r2'), child('c1', 'r1', 'r1', 1), child('c2', 'r2', 'r2', 1)];
    expect(treeOf('r1', runs).map((r) => r.id).sort()).toEqual(['c1', 'r1']);
  });
});

describe('activeDescendantsOf', () => {
  it('finds every active descendant, however deep, and skips finished ones', () => {
    const runs = [
      run('root'),
      child('a', 'root', 'root', 1),
      child('b', 'a', 'root', 2),
      child('done', 'root', 'root', 1, { status: 'succeeded' }),
      run('other'),
      child('x', 'other', 'other', 1),
    ];
    const ids = activeDescendantsOf('root', runs, terminal).map((r) => r.id).sort();
    expect(ids).toEqual(['a', 'b']);
  });

  it('returns nothing for a run with no children', () => {
    expect(activeDescendantsOf('lonely', [run('lonely')], terminal)).toEqual([]);
  });
});

describe('readRequestedParentRunId', () => {
  it('reads only the parent id', () => {
    expect(readRequestedParentRunId({ parentRunId: ' r1 ', depth: 0, rootRunId: 'x' })).toBe('r1');
  });

  it('treats a missing delegation as none', () => {
    expect(readRequestedParentRunId(undefined)).toBeNull();
    expect(readRequestedParentRunId(null)).toBeNull();
  });

  it('flags malformed delegations instead of ignoring them', () => {
    expect(readRequestedParentRunId('r1')).toBe('invalid');
    expect(readRequestedParentRunId([])).toBe('invalid');
    expect(readRequestedParentRunId({})).toBe('invalid');
    expect(readRequestedParentRunId({ parentRunId: '  ' })).toBe('invalid');
    expect(readRequestedParentRunId({ parentRunId: 4 })).toBe('invalid');
  });
});

describe('Lev, the general chat', () => {
  it('hands work to any project from its own space, with the same limits', () => {
    const runs = [run('lev', { projectId: 'lev-space' })];
    const decision = evaluateDelegation({
      parentRunId: 'lev',
      projectId: 'p2',
      targetAgentProfileId: null,
      getRun: (id) => runs.find((r) => r.id === id) ?? null,
      allRuns: () => runs,
      isTerminal: terminal,
      profileOf: () => null,
      parentMayCrossProjects: true,
    });
    expect(decision).toMatchObject({ ok: true, delegation: { parentRunId: 'lev', rootRunId: 'lev', depth: 1 } });
  });
});
