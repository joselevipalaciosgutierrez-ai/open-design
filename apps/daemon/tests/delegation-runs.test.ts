/**
 * Delegation over HTTP: a run that starts further runs from inside itself.
 * The daemon, not the model, decides how deep, how many and how at once; these
 * tests drive real runs (a fake long-lived agent binary) through POST /api/runs
 * and pin what comes back.
 */
import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = {
  url: string;
  server: http.Server;
  shutdown?: () => Promise<void> | void;
};

interface RunStatus {
  id: string;
  status: string;
  projectId: string | null;
  delegation: { parentRunId: string; rootRunId: string; depth: number } | null;
}

describe('delegation between runs', () => {
  let started: StartedServer;
  let binDir: string;
  let agentHome: string;
  let priorConfig: Record<string, unknown>;
  const oldPath = process.env.PATH;
  const oldAgentHome = process.env.OD_AGENT_HOME;
  const runIds: string[] = [];

  beforeAll(async () => {
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-delegation-bin-'));
    agentHome = await mkdtemp(path.join(os.tmpdir(), 'od-delegation-home-'));
    priorConfig = await readConfig(started.url);
    const opencodeBin = await writeLongLivedOpencode(binDir);
    process.env.PATH = '';
    process.env.OD_AGENT_HOME = agentHome;
    const response = await fetch(`${started.url}/api/app-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'opencode',
        agentCliEnv: { opencode: { OPENCODE_BIN: opencodeBin } },
      }),
    });
    expect(response.status).toBe(200);
  });

  afterAll(async () => {
    // Stop whatever is still running before tearing the server down.
    await Promise.all(
      runIds.map((id) =>
        fetch(`${started.url}/api/runs/${encodeURIComponent(id)}/cancel`, { method: 'POST' }).catch(
          () => undefined,
        ),
      ),
    );
    await fetch(`${started.url}/api/app-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: Object.hasOwn(priorConfig, 'agentId') ? priorConfig.agentId : null,
        agentCliEnv: Object.hasOwn(priorConfig, 'agentCliEnv') ? priorConfig.agentCliEnv : null,
      }),
    });
    await Promise.resolve(started.shutdown?.());
    await new Promise<void>((resolve) => started.server.close(() => resolve()));
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
    if (oldAgentHome === undefined) delete process.env.OD_AGENT_HOME;
    else process.env.OD_AGENT_HOME = oldAgentHome;
    await rm(binDir, { recursive: true, force: true });
    await rm(agentHome, { recursive: true, force: true });
  });

  async function startRun(projectId: string, extra: Record<string, unknown> = {}) {
    const conversationId = await createConversation(started.url, projectId);
    const response = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        conversationId,
        agentId: 'opencode',
        message: 'work',
        clientRequestId: randomUUID(),
        ...extra,
      }),
    });
    const body = (await response.json()) as { runId?: string; error?: { code?: string; message?: string } };
    if (body.runId) runIds.push(body.runId);
    return { status: response.status, runId: body.runId ?? '', error: body.error, conversationId };
  }

  async function status(runId: string): Promise<RunStatus> {
    const response = await fetch(`${started.url}/api/runs/${encodeURIComponent(runId)}`);
    return (await response.json()) as RunStatus;
  }

  async function waitFor<T>(read: () => Promise<T>, done: (v: T) => boolean, ms = 8000): Promise<T> {
    const deadline = Date.now() + ms;
    let value = await read();
    while (!done(value) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 60));
      value = await read();
    }
    return value;
  }

  it('records where a delegated run sits, derived from its parent', async () => {
    const { projectId } = await createProject(started.url);
    const root = await startRun(projectId);
    expect(root.status).toBe(202);

    // The request lies about its position; the daemon ignores everything but the parent.
    const delegated = await startRun(projectId, {
      delegation: { parentRunId: root.runId, rootRunId: 'forged', depth: 0 },
    });

    expect(delegated.status).toBe(202);
    const body = await status(delegated.runId);
    expect(body.delegation).toEqual({ parentRunId: root.runId, rootRunId: root.runId, depth: 1 });
    expect((await status(root.runId)).delegation).toBeNull();
  });

  it('refuses a fourth delegated run while three are active, and says to wait', async () => {
    const { projectId } = await createProject(started.url);
    const root = await startRun(projectId);
    for (let i = 0; i < 3; i += 1) {
      const delegated = await startRun(projectId, { delegation: { parentRunId: root.runId } });
      expect(delegated.status, `delegate ${i}`).toBe(202);
    }

    const fourth = await startRun(projectId, { delegation: { parentRunId: root.runId } });

    expect(fourth.status).toBe(429);
    expect(fourth.error?.code).toBe('DELEGATION_CONCURRENCY_LIMIT');
    expect(fourth.error?.message).toMatch(/wait/i);
  });

  it('does not let a leaf delegate: depth stops at two levels', async () => {
    const { projectId } = await createProject(started.url);
    const root = await startRun(projectId);
    const level1 = await startRun(projectId, { delegation: { parentRunId: root.runId } });
    const level2 = await startRun(projectId, { delegation: { parentRunId: level1.runId } });
    expect(level2.status).toBe(202);
    expect((await status(level2.runId)).delegation?.depth).toBe(2);

    const level3 = await startRun(projectId, { delegation: { parentRunId: level2.runId } });

    expect(level3.status).toBe(409);
    expect(level3.error?.code).toBe('DELEGATION_DEPTH_EXCEEDED');
  });

  it('rejects an unknown parent, a parent from another project, and a malformed delegation', async () => {
    const a = await createProject(started.url);
    const b = await createProject(started.url);
    const rootA = await startRun(a.projectId);

    expect((await startRun(a.projectId, { delegation: { parentRunId: 'ghost' } })).error?.code).toBe(
      'DELEGATION_PARENT_NOT_FOUND',
    );
    const cross = await startRun(b.projectId, { delegation: { parentRunId: rootA.runId } });
    expect(cross.status).toBe(400);
    expect(cross.error?.code).toBe('DELEGATION_CROSS_PROJECT');
    const malformed = await startRun(a.projectId, { delegation: 'nope' });
    expect(malformed.status).toBe(400);
  });

  it('runs two projects in parallel, each with its own delegation budget', async () => {
    const a = await createProject(started.url);
    const b = await createProject(started.url);
    const rootA = await startRun(a.projectId);
    const rootB = await startRun(b.projectId);
    for (let i = 0; i < 3; i += 1) {
      expect((await startRun(a.projectId, { delegation: { parentRunId: rootA.runId } })).status).toBe(202);
    }
    // Project A is saturated...
    expect((await startRun(a.projectId, { delegation: { parentRunId: rootA.runId } })).status).toBe(429);
    // ...and project B is untouched by it, and both roots are still running.
    expect((await startRun(b.projectId, { delegation: { parentRunId: rootB.runId } })).status).toBe(202);
    expect(['queued', 'running']).toContain((await status(rootA.runId)).status);
    expect(['queued', 'running']).toContain((await status(rootB.runId)).status);
  });

  it('stops everything an orchestrator started when it is cancelled', async () => {
    const { projectId } = await createProject(started.url);
    const root = await startRun(projectId);
    const level1 = await startRun(projectId, { delegation: { parentRunId: root.runId } });
    const level2 = await startRun(projectId, { delegation: { parentRunId: level1.runId } });
    const sibling = await startRun(projectId, { delegation: { parentRunId: root.runId } });

    const response = await fetch(`${started.url}/api/runs/${encodeURIComponent(root.runId)}/cancel`, {
      method: 'POST',
    });
    expect(response.status).toBeLessThan(300);

    for (const id of [level1.runId, level2.runId, sibling.runId]) {
      const final = await waitFor(() => status(id), (s) => s.status === 'canceled');
      expect(final.status, id).toBe('canceled');
    }
  }, 20000);
});

async function readConfig(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${url}/api/app-config`);
  const body = (await response.json()) as { config?: Record<string, unknown> };
  return body.config ?? {};
}

async function createProject(url: string): Promise<{ projectId: string }> {
  const projectId = `project_${randomUUID()}`;
  const response = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: projectId, name: 'Delegation', metadata: { kind: 'prototype' } }),
  });
  expect(response.status).toBe(200);
  return { projectId };
}

async function createConversation(url: string, projectId: string): Promise<string> {
  const response = await fetch(`${url}/api/projects/${encodeURIComponent(projectId)}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'delegate' }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { conversation: { id: string } };
  return body.conversation.id;
}

/** An opencode that stays alive until it is killed, so its run stays active. */
async function writeLongLivedOpencode(dir: string): Promise<string> {
  const bin = path.join(dir, 'opencode');
  await writeFile(
    bin,
    `#!/usr/bin/env node
if (process.argv.includes('--version')) { console.log('opencode 0.0.0'); process.exit(0); }
if (process.argv[2] === 'models') { console.log('test/model'); process.exit(0); }
if (process.argv[2] === 'run') {
  process.stdin.resume();
  setInterval(() => {}, 1000);
} else {
  process.exit(0);
}
`,
    'utf8',
  );
  await chmod(bin, 0o755);
  return bin;
}
