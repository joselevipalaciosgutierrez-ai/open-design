// Antigravity refreshes its hourly Google token on start. When that refresh
// is slow it gives up with "authentication failed or timed out", and the very
// next run signs in fine with no action from the person (seen live: a failed
// "hola" followed 9 s later by a successful one). That is a transient refresh,
// not a sign-out, so it gets the one silent retry instead of a dead-end
// "sign in" card.
import { describe, expect, it } from 'vitest';

import { classifyRunFailure } from '../src/run-failure-classification.js';

const REWRITTEN =
  "Antigravity needs to sign in. The agy CLI's keyring entry has expired or been cleared, and `-p` print mode cannot complete OAuth on its own.";

function classifyAgy(stderr: string) {
  return classifyRunFailure({
    result: 'failed',
    status: { status: 'failed', error: REWRITTEN, errorCode: 'AGENT_AUTH_REQUIRED', exitCode: 1, signal: null },
    errorCode: 'AGENT_AUTH_REQUIRED',
    agentId: 'antigravity',
    events: [
      { event: 'stderr', data: { chunk: stderr } },
      { event: 'error', data: { message: REWRITTEN, error: { code: 'AGENT_AUTH_REQUIRED', message: REWRITTEN } } },
    ],
  });
}

describe('antigravity token refresh timeout', () => {
  it('is a transient credential refresh, retried once', () => {
    const result = classifyAgy("Error: authentication required. Run 'agy' to log in, then retry.\nerror: authentication failed or timed out\n");
    expect(result?.failure_detail).toBe('credential_refresh_contention');
    expect(result?.retryable).toBe(true);
  });

  it('still asks to sign in when the CLI says only that login is required', () => {
    const result = classifyAgy("Error: authentication required. Run 'agy' to log in, then retry.\n");
    expect(result?.failure_category).toBe('auth');
  });
});
