/**
 * Home's agent picker: `POST /api/projects` may carry `agentProfileId`, which
 * binds the project's first conversation to that profile so its first run
 * already answers as that agent. A bad value is a 4xx, never a silent drop.
 */
import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('POST /api/projects · agentProfileId', () => {
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

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  async function post(path: string, body: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('binds the first conversation to the chosen agent', async () => {
    const agent = await post('/api/agent-profiles', { name: 'Home agent', runtimeId: 'antigravity' });
    expect(agent.status).toBe(201);
    const { profile } = (await agent.json()) as { profile: { id: string } };

    const created = await post('/api/projects', {
      id: 'agent-home-project',
      name: 'With agent',
      skillId: null,
      designSystemId: null,
      agentProfileId: profile.id,
    });
    expect(created.status).toBe(200);

    const list = await fetch(`${baseUrl}/api/projects/agent-home-project/conversations`);
    const { conversations } = (await list.json()) as {
      conversations: Array<{ agentProfileId: string | null }>;
    };
    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.agentProfileId).toBe(profile.id);
  });

  it('leaves the conversation unbound when no agent is sent', async () => {
    const created = await post('/api/projects', {
      id: 'no-agent-project',
      name: 'Without agent',
      skillId: null,
      designSystemId: null,
    });
    expect(created.status).toBe(200);
    const list = await fetch(`${baseUrl}/api/projects/no-agent-project/conversations`);
    const { conversations } = (await list.json()) as {
      conversations: Array<{ agentProfileId: string | null }>;
    };
    expect(conversations[0]?.agentProfileId ?? null).toBeNull();
  });

  it('rejects an agent that does not exist instead of dropping it', async () => {
    const created = await post('/api/projects', {
      id: 'ghost-agent-project',
      name: 'Ghost',
      skillId: null,
      designSystemId: null,
      agentProfileId: 'missing',
    });
    expect(created.status).toBe(404);
    const project = await fetch(`${baseUrl}/api/projects/ghost-agent-project`);
    expect(project.status).toBe(404);
  });
});
