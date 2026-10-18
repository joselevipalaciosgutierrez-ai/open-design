/**
 * End to end: what the agent CLI actually receives. A fake `opencode` records
 * its stdin and environment, so this proves the whole chain (resolver -> prompt
 * composition -> spawn) rather than each piece in isolation.
 */
import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = {
  url: string;
  server: http.Server;
  shutdown?: () => Promise<void> | void;
};

interface Capture {
  stdin: string;
  runId: string | null;
}

const DIRECTIVE = '# Orchestrator — you coordinate the user';

describe('the default assistant as orchestrator', () => {
  let started: StartedServer;
  let binDir: string;
  let agentHome: string;
  let captureDir: string;
  let priorConfig: Record<string, unknown>;
  const oldPath = process.env.PATH;
  const oldAgentHome = process.env.OD_AGENT_HOME;
  const oldCaptureDir = process.env.OD_TEST_CAPTURE_DIR;
  const runIds: string[] = [];

  beforeAll(async () => {
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-orch-bin-'));
    agentHome = await mkdtemp(path.join(os.tmpdir(), 'od-orch-home-'));
    captureDir = await mkdtemp(path.join(os.tmpdir(), 'od-orch-capture-'));
    priorConfig = await readConfig(started.url);
    const bin = await writeRecordingOpencode(binDir);
    process.env.PATH = '';
    process.env.OD_AGENT_HOME = agentHome;
    process.env.OD_TEST_CAPTURE_DIR = captureDir;
    const response = await fetch(`${started.url}/api/app-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'opencode', agentCliEnv: { opencode: { OPENCODE_BIN: bin } } }),
    });
    expect(response.status).toBe(200);
  });

  afterAll(async () => {
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
    if (oldCaptureDir === undefined) delete process.env.OD_TEST_CAPTURE_DIR;
    else process.env.OD_TEST_CAPTURE_DIR = oldCaptureDir;
    for (const dir of [binDir, agentHome, captureDir]) await rm(dir, { recursive: true, force: true });
  });

  async function createAgent(name: string, role: string): Promise<string> {
    const response = await fetch(`${started.url}/api/agent-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role, runtimeId: 'opencode' }),
    });
    expect(response.status).toBe(201);
    return ((await response.json()) as { profile: { id: string } }).profile.id;
  }

  async function deleteAllAgents(): Promise<void> {
    const list = (await (await fetch(`${started.url}/api/agent-profiles`)).json()) as {
      profiles: Array<{ id: string }>;
    };
    for (const profile of list.profiles) {
      await fetch(`${started.url}/api/agent-profiles/${profile.id}`, { method: 'DELETE' });
    }
  }

  async function runIn(opts: {
    agentProfileId?: string;
    sessionMode?: 'chat' | 'design';
    parentRunId?: string;
    projectId?: string;
  }): Promise<{ runId: string; projectId: string; capture: Capture }> {
    const projectId = opts.projectId ?? `project_${randomUUID()}`;
    if (!opts.projectId) {
      const created = await fetch(`${started.url}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, name: 'Orchestrator', metadata: { kind: 'prototype' } }),
      });
      expect(created.status).toBe(200);
    }
    const conversation = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/conversations`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'c',
          sessionMode: opts.sessionMode ?? 'chat',
          ...(opts.agentProfileId ? { agentProfileId: opts.agentProfileId } : {}),
        }),
      },
    );
    const conversationId = ((await conversation.json()) as { conversation: { id: string } }).conversation.id;
    const response = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        conversationId,
        agentId: 'opencode',
        message: 'hola',
        clientRequestId: randomUUID(),
        ...(opts.sessionMode ? { sessionMode: opts.sessionMode } : { sessionMode: 'chat' }),
        ...(opts.parentRunId ? { delegation: { parentRunId: opts.parentRunId } } : {}),
      }),
    });
    expect(response.status).toBe(202);
    const runId = ((await response.json()) as { runId: string }).runId;
    runIds.push(runId);
    return { runId, projectId, capture: await waitForCapture(runId) };
  }

  async function waitForCapture(runId: string): Promise<Capture> {
    const file = path.join(captureDir, `${runId}.json`);
    const deadline = Date.now() + 15000;
    while (!existsSync(file) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 80));
    }
    expect(existsSync(file), `the agent for run ${runId} never started`).toBe(true);
    // The file is written once, in one call; give a partial write a moment.
    for (let i = 0; i < 20; i += 1) {
      try {
        return JSON.parse(await readFile(file, 'utf8')) as Capture;
      } catch {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    throw new Error(`unreadable capture for ${runId}`);
  }

  it('tells the default assistant to coordinate when the user has agents and chose none', async () => {
    await deleteAllAgents();
    await createAgent('Diseño', 'Interfaces y maquetación');

    const { capture } = await runIn({});

    expect(capture.stdin).toContain(DIRECTIVE);
    expect(capture.stdin).toContain('Diseño');
    expect(capture.stdin).toContain('Interfaces y maquetación');
    // The panel question belongs to Ask mode, which this run is in.
    expect(capture.stdin).toContain('<od-switch-mode>design</od-switch-mode>');
  });

  it('gives the agent its own run id, so what it starts names it as the parent', async () => {
    await deleteAllAgents();
    await createAgent('Diseño', 'Interfaces');

    const { runId, capture } = await runIn({});

    expect(capture.runId).toBe(runId);
  });

  it('leaves the assistant ordinary when the user has no agents', async () => {
    await deleteAllAgents();

    const { capture } = await runIn({});

    expect(capture.stdin).not.toContain(DIRECTIVE);
  });

  it('does not coordinate when the user selected an agent: they talk to it directly', async () => {
    await deleteAllAgents();
    const design = await createAgent('Diseño', 'Interfaces');

    const { capture } = await runIn({ agentProfileId: design });

    expect(capture.stdin).not.toContain(DIRECTIVE);
  });

  it('does not tell a delegate to coordinate', async () => {
    await deleteAllAgents();
    await createAgent('Diseño', 'Interfaces');
    const root = await runIn({});

    const delegate = await runIn({ parentRunId: root.runId, projectId: root.projectId });

    expect(root.capture.stdin).toContain(DIRECTIVE);
    expect(delegate.capture.stdin).not.toContain(DIRECTIVE);
  });

  it('never asks about the design panel in a mode that already has it', async () => {
    await deleteAllAgents();
    await createAgent('Diseño', 'Interfaces');

    const { capture } = await runIn({ sessionMode: 'design' });

    expect(capture.stdin).toContain(DIRECTIVE);
    expect(capture.stdin).toContain('never ask whether to open it');
    expect(capture.stdin).not.toContain('<od-switch-mode>design</od-switch-mode>\n');
  });
});

async function readConfig(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${url}/api/app-config`);
  const body = (await response.json()) as { config?: Record<string, unknown> };
  return body.config ?? {};
}

/** An opencode that records its stdin and OD_RUN_ID per run, then stays alive. */
async function writeRecordingOpencode(dir: string): Promise<string> {
  const bin = path.join(dir, 'opencode');
  await writeFile(
    bin,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
if (process.argv.includes('--version')) { console.log('opencode 0.0.0'); process.exit(0); }
if (process.argv[2] === 'models') { console.log('test/model'); process.exit(0); }
if (process.argv[2] === 'run') {
  let stdin = '';
  let written = false;
  const write = () => {
    if (written) return;
    written = true;
    const runId = process.env.OD_RUN_ID || null;
    const out = path.join(process.env.OD_TEST_CAPTURE_DIR, (runId || 'unknown') + '.json');
    fs.writeFileSync(out + '.tmp', JSON.stringify({ stdin, runId }));
    fs.renameSync(out + '.tmp', out);
  };
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { stdin += chunk; });
  process.stdin.on('end', write);
  setTimeout(write, 1500);
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
