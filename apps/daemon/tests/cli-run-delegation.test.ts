// CLI half of delegation: `od run start` inside a run names that run as the
// parent (OD_RUN_ID), and a limit the daemon enforces comes back as a plain,
// actionable line instead of a raw JSON blob. Stub server, as in
// cli-run-steer.test.ts: what is proved here is the emitted request and output.

import http from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_ROOT = pathResolve(__dirname, '..');
const REPO_ROOT = pathResolve(__dirname, '../../..');
const CLI_SRC = pathResolve(__dirname, '../src/cli.ts');
const TSX_CLI = pathResolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');

interface Captured {
  method: string;
  url: string;
  body: string;
}

describe('od run start · delegation', () => {
  let server: http.Server;
  let baseUrl = '';
  const requests: Captured[] = [];
  let responder: () => { status: number; body: unknown } = () => ({
    status: 202,
    body: { runId: 'child-1' },
  });

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => {
        requests.push({ method: req.method ?? '', url: req.url ?? '', body: raw });
        const out = responder();
        res.statusCode = out.status;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(out.body));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no stub address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  beforeEach(() => {
    requests.length = 0;
    responder = () => ({ status: 202, body: { runId: 'child-1' } });
  });

  async function runStart(env: Record<string, string>) {
    const base: NodeJS.ProcessEnv = { ...process.env };
    delete base.NODE_OPTIONS;
    delete base.OD_RUN_ID;
    try {
      const { stdout, stderr } = await execFileP(
        process.execPath,
        [TSX_CLI, CLI_SRC, 'run', 'start', '--project', 'p1', '--message', 'do it', '--daemon-url', baseUrl],
        { cwd: DAEMON_ROOT, env: { ...base, ...env }, timeout: 20_000 },
      );
      return { stdout, stderr, code: 0 };
    } catch (err) {
      const failed = err as { stdout?: string; stderr?: string; code?: number };
      return { stdout: failed.stdout ?? '', stderr: failed.stderr ?? '', code: failed.code ?? 1 };
    }
  }

  it('names the surrounding run as the parent', async () => {
    const result = await runStart({ OD_RUN_ID: 'run-parent' });

    expect(result.code).toBe(0);
    const post = requests.find((r) => r.url === '/api/runs');
    expect(JSON.parse(post?.body ?? '{}').delegation).toEqual({ parentRunId: 'run-parent' });
  }, 40_000);

  it('sends no delegation when it is not running inside a run', async () => {
    await runStart({});

    const post = requests.find((r) => r.url === '/api/runs');
    expect(JSON.parse(post?.body ?? '{}')).not.toHaveProperty('delegation');
  }, 40_000);

  it('prints a refusal as one plain line the model can act on', async () => {
    responder = () => ({
      status: 429,
      body: {
        error: {
          code: 'DELEGATION_CONCURRENCY_LIMIT',
          message: '3 delegated runs are already running. Wait for one to finish.',
        },
      },
    });

    const result = await runStart({ OD_RUN_ID: 'run-parent' });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('delegation refused (DELEGATION_CONCURRENCY_LIMIT)');
    expect(result.stderr).toContain('Wait for one to finish.');
    expect(result.stderr).not.toContain('POST /api/runs failed');
  }, 40_000);
});
