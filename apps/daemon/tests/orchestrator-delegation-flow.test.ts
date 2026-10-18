/**
 * The whole delegation chain with nothing mocked but the model: a run's agent
 * process uses the real `od` CLI, with only the environment the daemon gave it,
 * to start a run in an agent's conversation. The fake "model" is a script that
 * delegates when asked to and otherwise just answers, so this proves the parts a
 * real CLI depends on (OD_RUN_ID, the CLI's parent forwarding, the daemon's
 * lineage and limits) without spending a token.
 */
import type http from 'node:http';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = { url: string; server: http.Server; shutdown?: () => Promise<void> | void };

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const TSX_CLI = path.resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');
const CLI_SRC = path.resolve(import.meta.dirname, '../src/cli.ts');

interface Capture {
  role: 'orchestrator' | 'delegate';
  steps: Array<{ cmd: string; code: number | null; stdout: string; stderr: string }>;
}

describe('delegating through the real od CLI from inside a run', () => {
  let started: StartedServer;
  let binDir: string;
  let agentHome: string;
  let captureDir: string;
  let priorConfig: Record<string, unknown>;
  const oldPath = process.env.PATH;
  const oldHome = process.env.OD_AGENT_HOME;
  const oldCapture = process.env.OD_TEST_CAPTURE_DIR;
  const oldCli = process.env.OD_TEST_CLI;
  const runIds: string[] = [];

  beforeAll(async () => {
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-flow-bin-'));
    agentHome = await mkdtemp(path.join(os.tmpdir(), 'od-flow-home-'));
    captureDir = await mkdtemp(path.join(os.tmpdir(), 'od-flow-capture-'));
    priorConfig = (
      (await (await fetch(`${started.url}/api/app-config`)).json()) as { config?: Record<string, unknown> }
    ).config ?? {};
    const bin = await writeFakeModel(binDir);
    process.env.PATH = '';
    process.env.OD_AGENT_HOME = agentHome;
    process.env.OD_TEST_CAPTURE_DIR = captureDir;
    process.env.OD_TEST_CLI = JSON.stringify({ node: process.execPath, tsx: TSX_CLI, cli: CLI_SRC });
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
        fetch(`${started.url}/api/runs/${id}/cancel`, { method: 'POST' }).catch(() => undefined),
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
    for (const [key, value] of [
      ['PATH', oldPath], ['OD_AGENT_HOME', oldHome], ['OD_TEST_CAPTURE_DIR', oldCapture], ['OD_TEST_CLI', oldCli],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    for (const dir of [binDir, agentHome, captureDir]) await rm(dir, { recursive: true, force: true });
  });

  async function post<T>(route: string, body: unknown): Promise<T> {
    const response = await fetch(`${started.url}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await response.json()) as T;
  }

  async function setUpAgents() {
    const list = (await (await fetch(`${started.url}/api/agent-profiles`)).json()) as {
      profiles: Array<{ id: string }>;
    };
    for (const profile of list.profiles) {
      await fetch(`${started.url}/api/agent-profiles/${profile.id}`, { method: 'DELETE' });
    }
    await post('/api/agent-profiles', { name: 'Diseño', emoji: '🎨', role: 'Interfaces', runtimeId: 'opencode' });
  }

  async function userRun(message: string) {
    const projectId = `project_${randomUUID()}`;
    const created = await post<{ conversationId: string }>('/api/projects', {
      id: projectId,
      name: 'Flow',
      metadata: { kind: 'prototype' },
    });
    const run = await post<{ runId: string }>('/api/runs', {
      projectId,
      conversationId: created.conversationId,
      agentId: 'opencode',
      message,
      sessionMode: 'chat',
      clientRequestId: randomUUID(),
    });
    runIds.push(run.runId);
    return { projectId, runId: run.runId };
  }

  async function capture(runId: string): Promise<Capture> {
    const file = path.join(captureDir, `${runId}.json`);
    const deadline = Date.now() + 60000;
    while (!existsSync(file) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
    expect(existsSync(file), `no capture for ${runId}`).toBe(true);
    return JSON.parse(await readFile(file, 'utf8')) as Capture;
  }

  async function delegatesOf(projectId: string, runId: string) {
    const response = await fetch(
      `${started.url}/api/projects/${projectId}/run-delegates?parentRunIds=${runId}`,
    );
    const body = (await response.json()) as {
      delegates: Record<string, Array<{ runId: string; depth: number; agent: { name: string } | null }>>;
    };
    return body.delegates[runId] ?? [];
  }

  it('lets the orchestrator start an agent\'s run, recorded under its own run', async () => {
    await setUpAgents();

    const { projectId, runId } = await userRun('PASA_A_DISENO una landing');

    const orchestrator = await capture(runId);
    expect(orchestrator.role).toBe('orchestrator');
    for (const step of orchestrator.steps) {
      expect(step.code, `${step.cmd}\n${step.stderr}`).toBe(0);
    }
    const delegates = await delegatesOf(projectId, runId);
    expect(delegates).toHaveLength(1);
    expect(delegates[0]).toMatchObject({ depth: 1, agent: { name: 'Diseño' } });
    // The agent's run is not itself an orchestrator.
    const delegated = await capture(delegates[0]!.runId);
    expect(delegated.role).toBe('delegate');
  }, 120000);

  it('delegates nothing for a conversation', async () => {
    await setUpAgents();

    const { projectId, runId } = await userRun('hola');

    const orchestrator = await capture(runId);
    expect(orchestrator.role).toBe('orchestrator');
    expect(orchestrator.steps).toEqual([]);
    expect(await delegatesOf(projectId, runId)).toEqual([]);
  }, 120000);
});

/**
 * Plays the model. Reads the prompt from stdin; if it is the orchestrator and
 * the user asked to hand off, it does exactly what the directive teaches, with
 * the real CLI and only the daemon-provided environment. Anything else just ends.
 */
async function writeFakeModel(dir: string): Promise<string> {
  const bin = path.join(dir, 'opencode');
  await writeFile(
    bin,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
if (process.argv.includes('--version')) { console.log('opencode 0.0.0'); process.exit(0); }
if (process.argv[2] === 'models') { console.log('test/model'); process.exit(0); }
if (process.argv[2] !== 'run') process.exit(0);

let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { stdin += c; });
process.stdin.on('end', () => {
  const cfg = JSON.parse(process.env.OD_TEST_CLI);
  const isOrchestrator = stdin.includes('# Orchestrator — you coordinate the user');
  const steps = [];
  const od = (...args) => {
    const r = spawnSync(cfg.node, [cfg.tsx, cfg.cli, ...args], { env: process.env, encoding: 'utf8', timeout: 90000 });
    steps.push({ cmd: 'od ' + args.join(' '), code: r.status, stdout: r.stdout, stderr: r.stderr });
    return r;
  };
  if (isOrchestrator && stdin.includes('PASA_A_DISENO')) {
    const list = JSON.parse(od('agent', 'list', '--json').stdout);
    const design = list.profiles.find((p) => p.name === 'Diseño');
    const conv = JSON.parse(od('conversation', 'new', process.env.OD_PROJECT_ID, '--agent', design.id, '--title', 'landing', '--json').stdout);
    od('run', 'start', '--project', process.env.OD_PROJECT_ID, '--conversation', conv.conversation.id, '--message', 'Haz la landing', '--follow');
  }
  const out = path.join(process.env.OD_TEST_CAPTURE_DIR, process.env.OD_RUN_ID + '.json');
  fs.writeFileSync(out, JSON.stringify({ role: isOrchestrator ? 'orchestrator' : 'delegate', steps }));
  process.exit(0);
});
`,
    'utf8',
  );
  await chmod(bin, 0o755);
  return bin;
}
