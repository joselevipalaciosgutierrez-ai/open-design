// `od config describe` shows each tuning preference with what is stored, what applies
// now and the default, read from the daemon (the process-limit default depends on the
// machine's memory, so the CLI does not recompute it).

import http from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppConfigTuningResponse } from '@open-design/contracts';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_ROOT = pathResolve(__dirname, '..');
const CLI_SRC = pathResolve(__dirname, '../src/cli.ts');
const TSX_CLI = pathResolve(__dirname, '../../../node_modules/tsx/dist/cli.mjs');

const response: AppConfigTuningResponse = {
  memoryGb: 16,
  settings: [
    { key: 'antigravityWarmMax', value: 3, effective: 3, default: 4, min: 0, max: 16, unit: 'processes' },
    { key: 'antigravityWarmIdleSeconds', value: null, effective: 180, default: 180, min: 5, max: 3600, unit: 'seconds' },
  ],
};

describe('od config describe', () => {
  let server: http.Server;
  let baseUrl = '';
  const paths: string[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      paths.push(req.url ?? '');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(req.url === '/api/app-config/tuning' ? response : { config: {} }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no stub address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  async function describeCli(...extra: string[]) {
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.NODE_OPTIONS;
    const { stdout } = await execFileP(
      process.execPath,
      [TSX_CLI, CLI_SRC, 'config', 'describe', ...extra, '--daemon-url', baseUrl],
      { cwd: DAEMON_ROOT, env, timeout: 20_000 },
    );
    return stdout;
  }

  it('prints one line per setting: what applies, where it comes from, the default and the range', async () => {
    const out = await describeCli();
    expect(paths).toContain('/api/app-config/tuning');
    const lines = out.trim().split('\n');
    const max = lines.find((l) => l.startsWith('antigravityWarmMax'))!;
    expect(max).toContain('3');
    expect(max).toMatch(/set/i);
    expect(max).toContain('default 4');
    expect(max).toContain('0-16');
    expect(max).toContain('processes');
    const idle = lines.find((l) => l.startsWith('antigravityWarmIdleSeconds'))!;
    expect(idle).toContain('180');
    expect(idle).toMatch(/default/i);
    expect(idle).toContain('5-3600');
    expect(out).toContain('16 GB');
  });

  it('emits the daemon answer as JSON for scripts', async () => {
    const parsed = JSON.parse(await describeCli('--json')) as AppConfigTuningResponse;
    expect(parsed).toEqual(response);
  });
});
