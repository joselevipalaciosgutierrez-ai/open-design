// @ts-nocheck
import * as http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isBlockedForAgents } from '../../src/agent-access/agent-gateway.js';

describe('lesson routes', () => {
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

  it('records, confirms, lists and removes a lesson', async () => {
    const post = (rule: string) =>
      fetch(`${baseUrl}/api/lessons`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rule }) });
    const first = await post('Check the dev server port before opening the preview');
    expect(first.status).toBe(201);
    const second = await post('check the dev server port before opening preview');
    expect((await second.json()).outcome).toBe('confirmed');
    const { lessons } = await (await fetch(`${baseUrl}/api/lessons`)).json();
    const lesson = lessons.find((l) => l.rule.startsWith('Check the dev server port'));
    expect(lesson.confirmations).toBe(2);
    expect((await fetch(`${baseUrl}/api/lessons/${lesson.id}`, { method: 'DELETE' })).status).toBe(200);
  });

  it('lets agents record and read lessons, never remove them', () => {
    expect(isBlockedForAgents('/api/lessons', 'POST')).toBe(false);
    expect(isBlockedForAgents('/api/lessons', 'GET')).toBe(false);
    expect(isBlockedForAgents('/api/lessons/abc', 'DELETE')).toBe(true);
  });
});
