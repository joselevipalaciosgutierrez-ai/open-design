import type http from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AppConfigResponse, UnsetAppConfigResponse } from '@open-design/contracts';

import { startServer } from '../src/server.js';

// The real daemon, over HTTP: `DELETE /api/app-config/:key` is the only way to remove
// a preference, because `PUT /api/app-config` merges the keys it receives and leaves
// the rest as they were. Only the Antigravity tuning keys are touched here, and they
// are removed again afterwards: the data directory is shared by the whole run.
describe('DELETE /api/app-config/:key', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterEach(async () => {
    for (const key of ['antigravityWarmMax', 'antigravityWarmIdleSeconds']) {
      await fetch(`${baseUrl}/api/app-config/${key}`, { method: 'DELETE' });
    }
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const put = (body: unknown) =>
    fetch(`${baseUrl}/api/app-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const get = async () => ((await (await fetch(`${baseUrl}/api/app-config`)).json()) as AppConfigResponse).config;
  const del = (key: string, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}/api/app-config/${key}`, { method: 'DELETE', headers });

  it('removes the key for real and leaves the others as they were', async () => {
    expect((await put({ antigravityWarmMax: 3, antigravityWarmIdleSeconds: 90 })).status).toBe(200);
    expect((await get()).antigravityWarmMax).toBe(3);

    const resp = await del('antigravityWarmMax');
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as UnsetAppConfigResponse;
    expect(body.removed).toBe(true);
    expect(body.config.antigravityWarmMax).toBeUndefined();

    const after = await get();
    expect(after.antigravityWarmMax).toBeUndefined();
    expect(after.antigravityWarmIdleSeconds).toBe(90);
  });

  it('shows that a PUT without the key never removed it (what unset used to rely on)', async () => {
    await put({ antigravityWarmMax: 3 });
    await put({ antigravityWarmIdleSeconds: 90 });
    expect((await get()).antigravityWarmMax).toBe(3);
  });

  it('says when there was nothing to remove', async () => {
    const body = (await (await del('antigravityWarmMax')).json()) as UnsetAppConfigResponse;
    expect(body.removed).toBe(false);
  });

  it('refuses consent, identity and credential keys, and keys that do not exist, with a readable reason', async () => {
    for (const key of ['telemetry', 'privacyDecisionAt', 'installationId', 'agentCliEnv', 'notAKey']) {
      const resp = await del(key);
      expect(resp.status, key).toBe(400);
      const body = (await resp.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('INVALID_APP_CONFIG_VALUE');
      expect(body.error.message).toContain(key);
    }
    expect((await get()).telemetry).toBeDefined();
  });

  it('rejects a request that comes from another origin', async () => {
    await put({ antigravityWarmMax: 3 });
    const resp = await del('antigravityWarmMax', { Origin: 'https://evil.example' });
    expect(resp.status).toBe(403);
    expect((await get()).antigravityWarmMax).toBe(3);
  });
});
