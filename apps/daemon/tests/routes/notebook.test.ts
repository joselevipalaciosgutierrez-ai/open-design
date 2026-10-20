// @ts-nocheck
import * as http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PROJECT_ID = 'notebook-route-fixture';

describe('project notebook routes', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const { startServer } = await import('../../src/server.js');
    const started = (await startServer({ port: 0, returnServer: true })) as unknown as { url: string; server: http.Server };
    baseUrl = started.url;
    server = started.server;
    await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: PROJECT_ID, name: 'Notebook fixture' }),
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('adds a note, reads it back, and lets the person rewrite it', async () => {
    const added = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/notebook/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: 'la app es solo móvil' }),
    });
    expect(added.status).toBe(201);
    const read = await (await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/notebook`)).json();
    expect(read.text).toContain('Lev · nota: la app es solo móvil');

    const edited = await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/notebook`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '# Notebook\n\n- corregido\n' }),
    });
    expect((await edited.json()).text).toBe('# Notebook\n\n- corregido\n');
  });

  it('is 404 for an unknown project', async () => {
    expect((await fetch(`${baseUrl}/api/projects/nope-123/notebook`)).status).toBe(404);
  });
});
