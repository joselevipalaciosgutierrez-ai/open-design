/**
 * `OD_RUN_ID` is how a run that starts further runs names its parent. It is
 * always set by the daemon for a run, and blank otherwise, so an ambient value
 * from the shell that launched the daemon can never become a run's parent.
 */
import { describe, expect, it } from 'vitest';

import { createOpenDesignToolEnv } from '../src/server.js';

describe('createOpenDesignToolEnv · OD_RUN_ID', () => {
  const base = { daemonUrl: 'http://127.0.0.1:1', projectId: 'p1', projectDir: '/tmp/p1' };

  it('carries the run id the daemon assigned', () => {
    expect(createOpenDesignToolEnv({ ...base, runId: 'run-42' }).OD_RUN_ID).toBe('run-42');
  });

  it('is blank, not absent, when there is no run id', () => {
    const env = createOpenDesignToolEnv(base);
    expect(Object.hasOwn(env, 'OD_RUN_ID')).toBe(true);
    expect(env.OD_RUN_ID).toBe('');
  });
});
