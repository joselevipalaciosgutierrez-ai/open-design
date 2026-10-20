/**
 * Agent processes started ahead of the next turn.
 *
 * Antigravity spends ~5 s of every run starting up (Google sign-in refresh,
 * model list, experiments) before it reads the message. After a turn ends,
 * the daemon starts the CLI for the conversation's next turn right away and
 * parks it here with its stdin open; when the next message arrives, the run
 * adopts the parked process and only writes the message. Measured: ~8 s to a
 * reply cold, ~3 s warm.
 *
 * A parked process is adopted only when its whole launch is identical to the
 * one the run would have spawned: command, arguments (the sandbox profile is
 * one of them), environment and working folder, with the per-run values
 * normalised away (see `warmLaunchKey`). Anything that differs, a changed
 * model, effort, access setting or skill folder, means a normal cold start,
 * never a process launched for something else.
 *
 * At most one process per conversation, discarded when a newer run of that
 * conversation starts, after an idle timeout, and when the daemon stops.
 */
import { createHash } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';

/** Environment values that belong to one run, not to the launch. */
const PER_RUN_ENV = ['OD_RUN_ID', 'OD_TOOL_TOKEN', 'OD_RUN_CONTEXT_FILE'];
/** Flags whose value belongs to one run (each takes one value). */
const PER_RUN_FLAGS = ['--log-file'];

export const WARM_AGENT_IDLE_MS = 10 * 60 * 1000;

export interface WarmLaunch {
  command: string;
  args: readonly string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
}

/** The identity of a launch, with the per-run values left out. */
export function warmLaunchKey(launch: WarmLaunch): string {
  const args = [...launch.args];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    for (const flag of PER_RUN_FLAGS) {
      if (arg === flag && i + 1 < args.length) args[i + 1] = '<per-run>';
      else if (arg.startsWith(`${flag}=`)) args[i] = `${flag}=<per-run>`;
      // The sandbox profile is one argument; a per-run value inside it would
      // be a bug, so it is compared whole.
    }
  }
  const env = Object.entries(launch.env)
    .filter(([name, value]) => value !== undefined && !PER_RUN_ENV.includes(name))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash('sha256')
    .update(JSON.stringify({ command: launch.command, args, env, cwd: launch.cwd }))
    .digest('hex');
}

export interface WarmAgent {
  key: string;
  child: ChildProcess;
  processGroupId: number | null;
  /** The `--log-file` this process writes, which the adopting run takes over. */
  logFilePath: string | null;
  startedAt: number;
}

export interface WarmAgentPoolOptions {
  idleMs?: number;
  /** Ends a process and its group. */
  kill?: (agent: WarmAgent) => void;
  now?: () => number;
  log?: (message: string) => void;
}

function defaultKill(agent: WarmAgent): void {
  try {
    if (agent.processGroupId) process.kill(-agent.processGroupId, 'SIGTERM');
    else agent.child.kill('SIGTERM');
  } catch {
    // Already gone.
  }
}

export class WarmAgentPool {
  private readonly parked = new Map<string, { agent: WarmAgent; timer: NodeJS.Timeout; onExit: () => void }>();
  /** Bumped every time a run of the conversation starts; a late park for an older turn is refused. */
  private readonly generations = new Map<string, number>();
  private readonly idleMs: number;
  private readonly kill: (agent: WarmAgent) => void;
  private readonly log: (message: string) => void;

  constructor(options: WarmAgentPoolOptions = {}) {
    this.idleMs = options.idleMs ?? WARM_AGENT_IDLE_MS;
    this.kill = options.kill ?? defaultKill;
    this.log = options.log ?? (() => {});
  }

  /** The conversation's current generation, to hand to `park` later. */
  generation(conversationId: string): number {
    return this.generations.get(conversationId) ?? 0;
  }

  /**
   * A run of the conversation is starting: it takes the parked process when
   * the launch matches, and any other parked process is ended. Either way a
   * park still in flight for an earlier turn is refused from now on.
   */
  take(conversationId: string, key: string): WarmAgent | null {
    this.generations.set(conversationId, this.generation(conversationId) + 1);
    const entry = this.parked.get(conversationId);
    if (!entry) return null;
    this.parked.delete(conversationId);
    clearTimeout(entry.timer);
    entry.agent.child.off('exit', entry.onExit);
    if (entry.agent.key === key && entry.agent.child.exitCode === null && entry.agent.child.signalCode === null) {
      return entry.agent;
    }
    this.log(`[warm-agents] launch changed for ${conversationId}; starting cold`);
    this.kill(entry.agent);
    return null;
  }

  /**
   * Parks a process for the conversation's next turn. Refused (and the
   * process ended) when a newer run of the conversation started meanwhile.
   */
  park(conversationId: string, generation: number, agent: WarmAgent): boolean {
    if (this.generation(conversationId) !== generation) {
      this.kill(agent);
      return false;
    }
    this.discard(conversationId);
    const timer = setTimeout(() => {
      if (this.parked.get(conversationId)?.agent === agent) {
        this.parked.delete(conversationId);
        this.kill(agent);
      }
    }, this.idleMs);
    timer.unref?.();
    const onExit = () => {
      if (this.parked.get(conversationId)?.agent === agent) {
        clearTimeout(timer);
        this.parked.delete(conversationId);
      }
    };
    agent.child.once('exit', onExit);
    this.parked.set(conversationId, { agent, timer, onExit });
    return true;
  }

  discard(conversationId: string): void {
    const entry = this.parked.get(conversationId);
    if (!entry) return;
    this.parked.delete(conversationId);
    clearTimeout(entry.timer);
    entry.agent.child.off('exit', entry.onExit);
    this.kill(entry.agent);
  }

  closeAll(): void {
    for (const conversationId of [...this.parked.keys()]) this.discard(conversationId);
  }

  get size(): number {
    return this.parked.size;
  }
}
