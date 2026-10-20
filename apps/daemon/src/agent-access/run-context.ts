/**
 * A run's identity for an agent process that was started before the run.
 *
 * An agent normally learns its run from its environment (`OD_RUN_ID`,
 * `OD_TOOL_TOKEN`). A process started ahead of time (see warm-agents.ts) has
 * no run yet, so its environment carries `OD_RUN_CONTEXT_FILE` instead: a
 * file in the agent's own folder, which only that agent's sandbox can read.
 * The daemon writes the run's identity there when the run adopts the process,
 * and every `od` command the agent runs reads it on start.
 */
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

export const RUN_CONTEXT_ENV = 'OD_RUN_CONTEXT_FILE';
export const RUN_CONTEXT_FILE = 'run-context.json';

export interface RunContext {
  runId: string;
  toolToken: string | null;
}

/**
 * For `od` started by an agent: take the run's identity from the context
 * file when the environment points at one. A missing or unreadable file
 * leaves the environment as it is.
 */
export function applyRunContextFile(env: NodeJS.ProcessEnv = process.env): void {
  const file = env[RUN_CONTEXT_ENV];
  if (!file) return;
  try {
    const context = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<RunContext>;
    if (typeof context.runId === 'string' && context.runId) env.OD_RUN_ID = context.runId;
    if (typeof context.toolToken === 'string' && context.toolToken) env.OD_TOOL_TOKEN = context.toolToken;
  } catch {
    // No context yet: the agent has not been given a run.
  }
}

export async function writeRunContextFile(dir: string, context: RunContext): Promise<string> {
  const file = path.join(dir, RUN_CONTEXT_FILE);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(file, JSON.stringify(context), { encoding: 'utf8', mode: 0o600 });
  return file;
}

/** Synchronous, for the spawn path, which must not yield after its cancellation check. */
export function writeRunContextFileSync(dir: string, context: RunContext): string {
  const file = path.join(dir, RUN_CONTEXT_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(context), { encoding: 'utf8', mode: 0o600 });
  return file;
}
