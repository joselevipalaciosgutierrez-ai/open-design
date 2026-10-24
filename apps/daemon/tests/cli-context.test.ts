import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_ROOT = pathResolve(__dirname, '..');
const CLI_SRC = pathResolve(__dirname, '../src/cli.ts');
const TSX_CLI = pathResolve(__dirname, '../../../node_modules/tsx/dist/cli.mjs');

async function od(args: string[], env: Record<string, string>) {
  const base: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'HOME']) if (process.env[key]) base[key] = process.env[key];
  const { stdout } = await execFileP(process.execPath, [TSX_CLI, CLI_SRC, ...args], {
    cwd: DAEMON_ROOT,
    env: { ...base, ...env },
    timeout: 20_000,
  });
  return stdout;
}

describe('od context', () => {
  const env = {
    OD_RUN_ID: 'run-9',
    OD_PROJECT_ID: 'proj-1',
    OD_PROJECT_DIR: '/work/proj-1',
    OD_DAEMON_URL: 'http://127.0.0.1:17456',
    OD_NODE_BIN: '/usr/bin/node',
    OD_BIN: '/opt/od/bin/od.mjs',
    // Noise a dump of the environment would drag in.
    ANTHROPIC_AUTH_TOKEN: 'secret-token-do-not-print',
    CLAUDE_CODE_SESSION_ID: 'abc',
  };

  it('prints only what a run needs, in a few lines', async () => {
    const out = await od(['context'], env);
    expect(out).toContain('run-9');
    expect(out).toContain('proj-1');
    expect(out).toContain('/work/proj-1');
    expect(out).toContain('http://127.0.0.1:17456');
    expect(out).not.toContain('secret-token-do-not-print');
    expect(out).not.toContain('CLAUDE_CODE');
    expect(out.length).toBeLessThan(600);
  });

  it('emits JSON for agents under --json', async () => {
    const parsed = JSON.parse(await od(['context', '--json'], env));
    expect(parsed).toMatchObject({ runId: 'run-9', projectId: 'proj-1', projectDir: '/work/proj-1' });
    expect(JSON.stringify(parsed)).not.toContain('secret');
  });

  it('says plainly when it is not inside a run', async () => {
    const out = await od(['context'], {});
    expect(out).toMatch(/not inside a run/i);
  });
});
