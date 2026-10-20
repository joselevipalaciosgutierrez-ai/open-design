// @ts-nocheck
// Lev's space: one hidden system project, created on first use, kept out of
// the project list, whose conversations are Lev's sessions.
import * as http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('GET /api/orchestrator', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const { startServer } = await import('../../src/server.js');
    const started = (await startServer({ port: 0, returnServer: true })) as unknown as { url: string; server: http.Server };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('creates Lev\'s project once and returns its sessions', async () => {
    const first = await (await fetch(`${baseUrl}/api/orchestrator`)).json();
    const second = await (await fetch(`${baseUrl}/api/orchestrator`)).json();
    expect(typeof first.projectId).toBe('string');
    expect(second.projectId).toBe(first.projectId);

    const created = await fetch(`${baseUrl}/api/projects/${first.projectId}/conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionMode: 'chat', title: 'Plan the week' }),
    });
    expect(created.ok).toBe(true);
    const after = await (await fetch(`${baseUrl}/api/orchestrator`)).json();
    expect(after.sessions.some((session) => session.title === 'Plan the week')).toBe(true);
  });

  it('keeps Lev out of the project list', async () => {
    const { projectId } = await (await fetch(`${baseUrl}/api/orchestrator`)).json();
    const { projects } = await (await fetch(`${baseUrl}/api/projects`)).json();
    expect(projects.some((project) => project.id === projectId)).toBe(false);
  });
});
