import type http from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AppConfigTuningResponse } from '@open-design/contracts';

import { startServer } from '../src/server.js';

describe('GET /api/app-config/tuning', () => {
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

  const tuning = async () => (await (await fetch(`${baseUrl}/api/app-config/tuning`)).json()) as AppConfigTuningResponse;
  const find = (r: AppConfigTuningResponse, key: string) => r.settings.find((s) => s.key === key)!;

  it('shows the stored value, the effective value and the default of each setting', async () => {
    const before = await tuning();
    expect(find(before, 'antigravityWarmMax').value).toBeNull();
    expect(find(before, 'antigravityWarmMax').effective).toBe(find(before, 'antigravityWarmMax').default);
    expect(before.memoryGb).toBeGreaterThan(0);

    await fetch(`${baseUrl}/api/app-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ antigravityWarmMax: 3 }),
    });
    const after = await tuning();
    expect(find(after, 'antigravityWarmMax')).toMatchObject({ value: 3, effective: 3, default: find(before, 'antigravityWarmMax').default });
  });

  it('returns to the default once the value is removed', async () => {
    await fetch(`${baseUrl}/api/app-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ antigravityWarmIdleSeconds: 90 }),
    });
    expect(find(await tuning(), 'antigravityWarmIdleSeconds').effective).toBe(90);
    await fetch(`${baseUrl}/api/app-config/antigravityWarmIdleSeconds`, { method: 'DELETE' });
    const s = find(await tuning(), 'antigravityWarmIdleSeconds');
    expect(s.value).toBeNull();
    expect(s.effective).toBe(180);
  });

  it('rejects a request that comes from another origin', async () => {
    const resp = await fetch(`${baseUrl}/api/app-config/tuning`, { headers: { Origin: 'https://evil.example' } });
    expect(resp.status).toBe(403);
  });
});
