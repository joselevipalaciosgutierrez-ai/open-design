// `od config unset <key>` asks the daemon to remove the key. It used to send the whole
// config back without that key to PUT /api/app-config, which only merges the keys it
// receives, so the old value stayed and the command still said it had worked.

import http from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_ROOT = pathResolve(__dirname, '..');
const CLI_SRC = pathResolve(__dirname, '../src/cli.ts');
const TSX_CLI = pathResolve(__dirname, '../../../node_modules/tsx/dist/cli.mjs');

interface Captured {
  method: string;
  url: string;
}

describe('od config unset', () => {
  let server: http.Server;
  let baseUrl = '';
  const requests: Captured[] = [];
  let reply: { status: number; body: unknown } = { status: 200, body: { config: {}, removed: true } };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        requests.push({ method: req.method ?? '', url: req.url ?? '' });
        const isUnset = req.method === 'DELETE';
        res.statusCode = isUnset ? reply.status : 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(isUnset ? reply.body : { config: { antigravityWarmMax: 1 } }));
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
    reply = { status: 200, body: { config: {}, removed: true } };
  });

  async function unset(key: string) {
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.NODE_OPTIONS;
    try {
      const { stdout, stderr } = await execFileP(
        process.execPath,
        [TSX_CLI, CLI_SRC, 'config', 'unset', key, '--daemon-url', baseUrl],
        { cwd: DAEMON_ROOT, env, timeout: 20_000 },
      );
      return { code: 0, stdout, stderr };
    } catch (error) {
      const e = error as { code?: number; stdout?: string; stderr?: string };
      return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
    }
  }

  it('asks the daemon to remove the key instead of resending the config without it', async () => {
    const out = await unset('antigravityWarmMax');
    expect(out.code).toBe(0);
    expect(requests).toContainEqual({ method: 'DELETE', url: '/api/app-config/antigravityWarmMax' });
    expect(requests.some((r) => r.method === 'PUT')).toBe(false);
    expect(out.stdout).toMatch(/unset antigravityWarmMax/);
  });

  it('says so when the key was not set', async () => {
    reply = { status: 200, body: { config: {}, removed: false } };
    const out = await unset('antigravityWarmMax');
    expect(out.code).toBe(0);
    expect(out.stdout).toMatch(/was not set/i);
  });

  it('fails with the daemon reason when the key cannot be unset', async () => {
    reply = {
      status: 400,
      body: { error: { code: 'INVALID_APP_CONFIG_VALUE', message: 'telemetry cannot be unset' } },
    };
    const out = await unset('telemetry');
    expect(out.code).not.toBe(0);
    expect(`${out.stdout}${out.stderr}`).toContain('telemetry cannot be unset');
  });
});
