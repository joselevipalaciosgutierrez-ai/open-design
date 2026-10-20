import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { describeAgentStats, readAgentStatsSync, recordAgentOutcome } from '../src/agent-stats.js';

describe('agent track records', () => {
  it('counts finished orders per agent, ignoring canceled ones', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'od-agent-stats-'));
    await recordAgentOutcome(dir, 'design', 'succeeded', 1);
    await recordAgentOutcome(dir, 'design', 'succeeded', 2);
    await recordAgentOutcome(dir, 'design', 'failed', 3);
    await recordAgentOutcome(dir, 'design', 'canceled', 4);
    const stats = readAgentStatsSync(dir).design;
    expect(stats).toEqual({ succeeded: 2, failed: 1, lastAt: 3 });
    expect(describeAgentStats(stats)).toBe('3 orders, 2 done, 1 failed');
  });

  it('says nothing for an agent with no orders', () => {
    expect(describeAgentStats(undefined)).toBeNull();
  });
});
