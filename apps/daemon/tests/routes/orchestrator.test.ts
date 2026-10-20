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
    const { conversation } = await created.json();
    // An empty session is not offered.
    let after = await (await fetch(`${baseUrl}/api/orchestrator`)).json();
    expect(after.sessions.some((session) => session.id === conversation.id)).toBe(false);

    await fetch(`${baseUrl}/api/projects/${first.projectId}/conversations/${conversation.id}/messages/m1`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'm1', role: 'user', content: 'Organiza   mi semana', createdAt: Date.now() }),
    });
    after = await (await fetch(`${baseUrl}/api/orchestrator`)).json();
    const session = after.sessions.find((candidate) => candidate.id === conversation.id);
    expect(session).toMatchObject({ title: 'Plan the week', preview: 'Organiza mi semana', messageCount: 1 });
  });

  it('keeps Lev out of the project list', async () => {
    const { projectId } = await (await fetch(`${baseUrl}/api/orchestrator`)).json();
    const { projects } = await (await fetch(`${baseUrl}/api/projects`)).json();
    expect(projects.some((project) => project.id === projectId)).toBe(false);
  });
});

describe('Lev orders', () => {
  it('collects the runs a turn started, directly or through its delegates', async () => {
    const { ordersOf } = await import('../../src/routes/orchestrator.js');
    const runs = [
      { id: 'lev-run', projectId: 'lev', delegation: null },
      { id: 'b', projectId: 'p2', createdAt: 2, delegation: { parentRunId: 'lev-run', rootRunId: 'lev-run' } },
      { id: 'a', projectId: 'p1', createdAt: 1, delegation: { parentRunId: 'lev-run', rootRunId: 'lev-run' } },
      { id: 'grandchild', projectId: 'p1', createdAt: 3, delegation: { parentRunId: 'a', rootRunId: 'lev-run' } },
      { id: 'other', projectId: 'p1', createdAt: 4, delegation: { parentRunId: 'x', rootRunId: 'x' } },
    ];
    expect(ordersOf('lev-run', runs).map((run) => run.id)).toEqual(['a', 'b', 'grandchild']);
  });
});
