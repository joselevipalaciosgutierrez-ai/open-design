import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runResource } from '../src/resource-cli.js';

describe('od resource compatibility entry point', () => {
  beforeEach(() => {
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('notifies that resource hub is unavailable in standalone mode', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runResource([]);

    expect(error).toHaveBeenCalledWith('Resource hub is unavailable in standalone mode.');
    expect(process.exitCode).toBe(1);
  });
});
