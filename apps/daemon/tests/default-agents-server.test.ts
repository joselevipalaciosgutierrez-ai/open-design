import type http from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

// The real daemon: once the person has chosen a CLI the Design agent appears, with the
// design-craft skill, and deleting it sticks. (Other suites run with seeding off.)
describe('default Design agent, through the daemon', () => {
  const previous = process.env.OD_SEED_DEFAULT_AGENTS;
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.OD_SEED_DEFAULT_AGENTS = 'on';
    const started = (await startServer({ port: 0, returnServer: true })) as { url: string; server: http.Server };
    baseUrl = started.url;
    server = started.server;
  });

  afterEach(async () => {
    for (const p of await profiles()) await fetch(`${baseUrl}/api/agent-profiles/${p.id}`, { method: 'DELETE' });
  });

  afterAll(async () => {
    if (previous === undefined) delete process.env.OD_SEED_DEFAULT_AGENTS;
    else process.env.OD_SEED_DEFAULT_AGENTS = previous;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  type Profile = { id: string; name: string; runtimeId: string; skillIds: string[] };
  const profiles = async () =>
    ((await (await fetch(`${baseUrl}/api/agent-profiles`)).json()) as { profiles: Profile[] }).profiles;
  const setCli = (agentId: string) =>
    fetch(`${baseUrl}/api/app-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
  const until = async <T,>(read: () => Promise<T>, ok: (v: T) => boolean) => {
    for (let i = 0; i < 40; i += 1) {
      const v = await read();
      if (ok(v)) return v;
      await new Promise((r) => setTimeout(r, 50));
    }
    return read();
  };

  it('creates Design once a CLI is chosen, and a deletion is permanent', async () => {
    await setCli('claude');
    const found = await until(profiles, (list) => list.length > 0);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ name: 'Design', runtimeId: 'claude', skillIds: ['design-craft'] });

    await fetch(`${baseUrl}/api/agent-profiles/${found[0]!.id}`, { method: 'DELETE' });
    await setCli('codex');
    await setCli('claude');
    await new Promise((r) => setTimeout(r, 300));
    expect(await profiles()).toEqual([]);
  });
});
