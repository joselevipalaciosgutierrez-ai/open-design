// `od run start --follow` from inside a run (OD_RUN_ID set) returns the outcome,
// not the delegate's whole event stream. Stub server with an SSE endpoint, as in
// cli-run-delegation.test.ts: what is proved is what the CLI prints.

import http from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_ROOT = pathResolve(__dirname, '..');
const REPO_ROOT = pathResolve(__dirname, '../../..');
const CLI_SRC = pathResolve(__dirname, '../src/cli.ts');
const TSX_CLI = pathResolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

describe('od run start --follow · compact return', () => {
  let server: http.Server;
  let baseUrl = '';

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.method === 'POST') {
        req.resume();
        req.on('end', () => {
          res.statusCode = 202;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ runId: 'child-1' }));
        });
        return;
      }
      res.setHeader('content-type', 'text/event-stream');
      res.write(sse('start', { runId: 'child-1' }));
      res.write(sse('agent', { type: 'text_delta', delta: 'All done, see index.html.' }));
      for (let i = 0; i < 30; i += 1) {
        res.write(sse('agent', { type: 'tool_result', content: 'noise'.repeat(400) }));
      }
      res.end(sse('end', { status: 'succeeded', code: 0, artifactPaths: ['index.html'] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no stub address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  async function follow(env: Record<string, string>, extra: string[] = []): Promise<string> {
    const base: NodeJS.ProcessEnv = { ...process.env };
    delete base.NODE_OPTIONS;
    delete base.OD_RUN_ID;
    const { stdout } = await execFileP(
      process.execPath,
      [TSX_CLI, CLI_SRC, 'run', 'start', '--project', 'p1', '--message', 'go', '--follow', ...extra, '--daemon-url', baseUrl],
      { cwd: DAEMON_ROOT, env: { ...base, ...env }, timeout: 20_000 },
    );
    return stdout;
  }

  it('prints the outcome, not the stream, when it delegates', async () => {
    const out = await follow({ OD_RUN_ID: 'parent-1' });
    expect(out).toContain('finished: succeeded');
    expect(out).toContain('All done, see index.html.');
    expect(out).toContain('Files: index.html');
    expect(out).not.toContain('noisenoise');
    expect(out.length).toBeLessThan(800);
  });

  it('prints every event with --stream', async () => {
    const out = await follow({ OD_RUN_ID: 'parent-1' }, ['--stream']);
    expect(out).toContain('"event":"end"');
    expect(out).toContain('noisenoise');
  });

  it('prints every event outside a run, as before', async () => {
    const out = await follow({});
    expect(out).toContain('"event":"end"');
    expect(out).toContain('noisenoise');
  });
});
