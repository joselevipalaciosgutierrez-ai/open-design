/**
 * Delegation between runs: an orchestrator run asking the daemon to start
 * further runs (agents, sub-agents) from inside its own CLI process.
 *
 * The limits live here, in code, rather than in the prompt. A prompt that says
 * "do not loop" is a request to a model; a daemon that refuses the 9th run in a
 * tree is a guarantee. They come from how comparable systems fail: unbounded
 * fan-out (dozens of redundant agents from one request), agents spawning agents
 * without a ceiling, and per-agent budgets that do not bound the whole tree.
 *
 * Everything the daemon records about a delegation is DERIVED from the parent
 * run it already holds. A caller only names the parent; depth, root and tree
 * membership are never taken from the request, so a run cannot claim a shallower
 * position than it has.
 */

export interface DelegationLimits {
  /**
   * Levels below the user's own run. 1 = agents, 2 = their sub-agents. A run at
   * the limit is a leaf and cannot delegate again.
   */
  maxDepth: number;
  /** Runs one user request may spawn in total, across the whole tree. */
  maxRunsPerTree: number;
  /** Delegated runs that may be active at once in one tree. */
  maxConcurrentPerTree: number;
  /** Active runs of the same agent profile in one tree. */
  maxInstancesPerAgent: number;
}

export const DEFAULT_DELEGATION_LIMITS: DelegationLimits = {
  maxDepth: 2,
  maxRunsPerTree: 8,
  maxConcurrentPerTree: 3,
  maxInstancesPerAgent: 2,
};

/** Where a delegated run sits in its tree. Always daemon-derived. */
export interface RunDelegation {
  parentRunId: string;
  /** The user's own run at the top of the tree. */
  rootRunId: string;
  /** 1 for a run started by the root, 2 for one started by that run, ... */
  depth: number;
}

/** The slice of a run this module needs. */
export interface DelegationRun {
  id: string;
  status: string;
  projectId?: string | null;
  conversationId?: string | null;
  delegation?: RunDelegation | null;
}

export type DelegationRefusalCode =
  | 'DELEGATION_INVALID'
  | 'DELEGATION_PARENT_NOT_FOUND'
  | 'DELEGATION_PARENT_FINISHED'
  | 'DELEGATION_CROSS_PROJECT'
  | 'DELEGATION_DEPTH_EXCEEDED'
  | 'DELEGATION_BUDGET_EXCEEDED'
  | 'DELEGATION_CONCURRENCY_LIMIT'
  | 'DELEGATION_AGENT_BUSY';

export type DelegationDecision =
  | { ok: true; delegation: RunDelegation }
  | {
      ok: false;
      status: number;
      code: DelegationRefusalCode;
      message: string;
      /** True when waiting for a running delegate to finish can make it succeed. */
      retryable: boolean;
    };

export interface EvaluateDelegationInput {
  /** The run the caller says it is acting from (`OD_RUN_ID`). */
  parentRunId: string;
  /** Project of the run being created. */
  projectId: string | null;
  /** Agent profile the new run will execute as, when it has one. */
  targetAgentProfileId: string | null;
  getRun: (id: string) => DelegationRun | null;
  /** Every run the registry knows, finished ones included (the budget counts them). */
  allRuns: () => DelegationRun[];
  isTerminal: (status: string) => boolean;
  /** Agent profile a run executes as; null for runs without one. */
  profileOf: (run: DelegationRun) => string | null;
  limits?: DelegationLimits;
}

function refuse(
  status: number,
  code: DelegationRefusalCode,
  message: string,
  retryable = false,
): DelegationDecision {
  return { ok: false, status, code, message, retryable };
}

/** Root of the tree a run belongs to; a run that was not delegated is its own root. */
export function rootRunIdOf(run: DelegationRun): string {
  return run.delegation?.rootRunId ?? run.id;
}

/** Runs of one delegation tree, the root included. */
export function treeOf(rootRunId: string, runs: DelegationRun[]): DelegationRun[] {
  return runs.filter((run) => run.id === rootRunId || run.delegation?.rootRunId === rootRunId);
}

/**
 * Whether a new run may be started by `parentRunId`, and where it would sit.
 *
 * Refusals carry an actionable message: it is what an orchestrator's CLI prints
 * back to the model, so it says what to do instead (wait, do it yourself).
 */
export function evaluateDelegation(input: EvaluateDelegationInput): DelegationDecision {
  const limits = input.limits ?? DEFAULT_DELEGATION_LIMITS;
  const parent = input.getRun(input.parentRunId);
  if (!parent) {
    return refuse(
      404,
      'DELEGATION_PARENT_NOT_FOUND',
      'The run you are delegating from does not exist. Delegate only from inside a running OpenDesign task.',
    );
  }
  if (input.isTerminal(parent.status)) {
    return refuse(
      409,
      'DELEGATION_PARENT_FINISHED',
      'The run you are delegating from has already finished, so it can no longer start new runs.',
    );
  }
  if (input.projectId !== (parent.projectId ?? null)) {
    return refuse(
      400,
      'DELEGATION_CROSS_PROJECT',
      'Delegation stays inside one project. Work in another project is a separate task the user starts, not a delegate.',
    );
  }

  const depth = (parent.delegation?.depth ?? 0) + 1;
  if (depth > limits.maxDepth) {
    return refuse(
      409,
      'DELEGATION_DEPTH_EXCEEDED',
      `Delegation goes at most ${limits.maxDepth} levels deep and this run is already at the last one. `
        + 'Do the work yourself instead of delegating it.',
    );
  }

  const rootRunId = rootRunIdOf(parent);
  const tree = treeOf(rootRunId, input.allRuns());
  const delegated = tree.filter((run) => run.id !== rootRunId);

  if (delegated.length >= limits.maxRunsPerTree) {
    return refuse(
      429,
      'DELEGATION_BUDGET_EXCEEDED',
      `This request has already started ${delegated.length} delegated runs, the most it may start. `
        + 'Finish with what you have and report it, or ask the user before going further.',
    );
  }

  const active = delegated.filter((run) => !input.isTerminal(run.status));
  if (active.length >= limits.maxConcurrentPerTree) {
    return refuse(
      429,
      'DELEGATION_CONCURRENCY_LIMIT',
      `${active.length} delegated runs are already running, the most that may run at once. `
        + 'Wait for one to finish, then start the next.',
      true,
    );
  }

  if (input.targetAgentProfileId) {
    const sameAgent = active.filter((run) => input.profileOf(run) === input.targetAgentProfileId);
    if (sameAgent.length >= limits.maxInstancesPerAgent) {
      return refuse(
        429,
        'DELEGATION_AGENT_BUSY',
        `That agent already has ${sameAgent.length} runs going, the most it may have at once. `
          + 'Wait for one to finish, or give it to a different agent.',
        true,
      );
    }
  }

  return { ok: true, delegation: { parentRunId: parent.id, rootRunId, depth } };
}

/** Active runs started, directly or not, by `runId`. Used to cancel a whole subtree. */
export function activeDescendantsOf(
  runId: string,
  runs: DelegationRun[],
  isTerminal: (status: string) => boolean,
): DelegationRun[] {
  const found: DelegationRun[] = [];
  const queue = [runId];
  const seen = new Set<string>(queue);
  while (queue.length > 0) {
    const parentId = queue.shift() as string;
    for (const run of runs) {
      if (run.delegation?.parentRunId !== parentId || seen.has(run.id)) continue;
      seen.add(run.id);
      queue.push(run.id);
      if (!isTerminal(run.status)) found.push(run);
    }
  }
  return found;
}

/**
 * Reads the `delegation` a request body carries. Only `parentRunId` is honoured;
 * returns null when the body carries none, and 'invalid' for a malformed one.
 */
export function readRequestedParentRunId(value: unknown): string | null | 'invalid' {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return 'invalid';
  const parent = (value as Record<string, unknown>).parentRunId;
  if (typeof parent !== 'string' || parent.trim().length === 0) return 'invalid';
  return parent.trim();
}
