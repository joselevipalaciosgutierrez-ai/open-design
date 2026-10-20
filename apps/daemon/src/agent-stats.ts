/**
 * How each agent's work has gone: finished orders per agent profile, how many
 * ended well, and when it last worked. The orchestrator reads it to hand work
 * to agents that do it well. Plain JSON in the daemon's data.
 */
import fs, { promises as fsp } from 'node:fs';
import path from 'node:path';

export interface AgentStats {
  succeeded: number;
  failed: number;
  lastAt: number;
}

export function agentStatsPath(dataDir: string): string {
  return path.join(dataDir, 'agent-stats.json');
}

export function readAgentStatsSync(dataDir: string): Record<string, AgentStats> {
  try {
    const parsed = JSON.parse(fs.readFileSync(agentStatsPath(dataDir), 'utf8')) as Record<string, AgentStats>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

let writing: Promise<void> = Promise.resolve();

/** Adds one finished order to an agent's record; canceled runs do not count. */
export function recordAgentOutcome(dataDir: string, profileId: string, status: string, at = Date.now()): Promise<void> {
  if (status !== 'succeeded' && status !== 'failed') return Promise.resolve();
  writing = writing.then(async () => {
    const stats = readAgentStatsSync(dataDir);
    const current = stats[profileId] ?? { succeeded: 0, failed: 0, lastAt: 0 };
    stats[profileId] = {
      succeeded: current.succeeded + (status === 'succeeded' ? 1 : 0),
      failed: current.failed + (status === 'failed' ? 1 : 0),
      lastAt: Math.max(current.lastAt, at),
    };
    await fsp.mkdir(dataDir, { recursive: true });
    await fsp.writeFile(agentStatsPath(dataDir), JSON.stringify(stats, null, 2), 'utf8');
  }).catch(() => undefined);
  return writing;
}

/** "12 orders, 11 done" — the record as one short phrase, or null when it has none. */
export function describeAgentStats(stats: AgentStats | undefined): string | null {
  if (!stats) return null;
  const total = stats.succeeded + stats.failed;
  if (total === 0) return null;
  return `${total} ${total === 1 ? 'order' : 'orders'}, ${stats.succeeded} done${stats.failed ? `, ${stats.failed} failed` : ''}`;
}
