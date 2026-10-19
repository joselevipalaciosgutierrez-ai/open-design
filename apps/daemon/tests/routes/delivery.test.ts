// @ts-nocheck
// HTTP-layer tests for `GET /api/projects/:id/delivery`: spin up the real
// daemon, write a DELIVERY.json into a real project folder, and read it back.

import fs from 'node:fs';
import * as http from 'node:http';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PROJECT_ID = 'delivery-route-fixture';

describe('GET /api/projects/:id/delivery — HTTP layer', () => {
  let server: http.Server;
  let baseUrl: string;
  let projectDir: string;

  beforeAll(async () => {
    const { startServer } = await import('../../src/server.js');
    const started = (await startServer({ port: 0, returnServer: true })) as unknown as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: PROJECT_ID, name: 'Delivery fixture' }),
    });
    projectDir = path.join(dataDir, 'projects', PROJECT_ID);
    fs.mkdirSync(projectDir, { recursive: true });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const write = (stages: unknown[], goal = 'Landing') =>
    fs.writeFileSync(path.join(projectDir, 'DELIVERY.json'), JSON.stringify({ goal, stages }));
  const stage = (id: string, over = {}) => ({
    id, name: `Stage ${id}`, agent: 'a1', deliverable: `${id}.md`, status: 'pending', ...over,
  });
  const read = async () => (await fetch(`${baseUrl}/api/projects/${PROJECT_ID}/delivery`)).json();

  it('says not present when the project has no DELIVERY.json', async () => {
    fs.rmSync(path.join(projectDir, 'DELIVERY.json'), { force: true });
    const body = await read();
    expect(body).toMatchObject({ present: false, total: 0, finished: false });
  });

  it('reports progress and the next stage', async () => {
    write([stage('design', { status: 'done' }), stage('build')]);
    const body = await read();
    expect(body).toMatchObject({ present: true, completed: 1, total: 2, finished: false, violations: [] });
    expect(body.next.id).toBe('build');
  });

  it('reports an edit that deleted a stage, and keeps reporting it until it is put right', async () => {
    write([stage('design', { status: 'done' }), stage('build')]);
    await read();
    write([stage('design', { status: 'done' })]);
    expect((await read()).violations.join(' ')).toContain('removed or moved');
    expect((await read()).violations.length).toBeGreaterThan(0);
    write([stage('design', { status: 'done' }), stage('build', { status: 'running' })]);
    expect((await read()).violations).toEqual([]);
  });

  it('survives a file that is not JSON', async () => {
    fs.writeFileSync(path.join(projectDir, 'DELIVERY.json'), '{broken');
    const body = await read();
    expect(body.present).toBe(false);
    expect(body.issues[0]).toContain('not valid JSON');
  });

  it('404s an unknown project and 400s an unsafe id', async () => {
    expect((await fetch(`${baseUrl}/api/projects/no-such-project/delivery`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/projects/${encodeURIComponent('../x')}/delivery`)).status).toBe(400);
  });
});
