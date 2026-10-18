/**
 * Runs the orchestrator intent cases against a live daemon and reports how
 * often the CLI behaves as the directive asks. It spends the quota of whichever
 * CLI the daemon is set to, so it only runs when told to.
 *
 *   pnpm tools-dev start web --namespace eval --daemon-port 17931 --web-port 17932
 *   pnpm --filter @open-design/daemon exec tsx tests/evals/orchestrator-intent-eval.ts \
 *     --daemon-url http://127.0.0.1:17931 --run [--only id,id] [--limit 10] [--json out.json]
 *
 * Use a daemon of its own (a separate namespace and data dir): the run creates
 * three agents named Diseño, Desarrollo and QA and many projects, and it
 * refuses to start when the daemon already has agents. The agents' own runs use
 * a stub CLI that exits at once, so what is spent is the orchestrator's turn
 * only, never the delegated work.
 */
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  EVAL_AGENTS,
  INTENT_CASES,
  scoreCase,
  summarize,
  type CaseResult,
  type IntentCase,
} from './orchestrator-intent-cases.js';

const TERMINAL = new Set(['succeeded', 'failed', 'canceled']);
const DELEGATE_RUNTIME = 'opencode';

interface Options {
  daemonUrl: string;
  run: boolean;
  only: string[] | null;
  limit: number | null;
  timeoutMs: number;
  jsonPath: string | null;
  minAccuracy: number | null;
}

export function parseArgs(argv: readonly string[]): Options {
  const read = (flag: string): string | null => {
    const index = argv.indexOf(flag);
    return index >= 0 ? (argv[index + 1] ?? null) : null;
  };
  const daemonUrl = read('--daemon-url');
  if (!daemonUrl) throw new Error('--daemon-url <url> is required');
  const only = read('--only');
  const limit = read('--limit');
  const timeout = read('--timeout-s');
  const min = read('--min-accuracy');
  return {
    daemonUrl: daemonUrl.replace(/\/$/, ''),
    run: argv.includes('--run'),
    only: only ? only.split(',').map((id) => id.trim()).filter(Boolean) : null,
    limit: limit ? Number(limit) : null,
    timeoutMs: (timeout ? Number(timeout) : 240) * 1000,
    jsonPath: read('--json'),
    minAccuracy: min ? Number(min) : null,
  };
}

export function selectCases(options: Pick<Options, 'only' | 'limit'>): IntentCase[] {
  let cases = [...INTENT_CASES];
  if (options.only) {
    const wanted = new Set(options.only);
    cases = cases.filter((c) => wanted.has(c.id));
  }
  if (options.limit !== null && Number.isFinite(options.limit)) cases = cases.slice(0, options.limit);
  return cases;
}

async function api<T>(base: string, route: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${route}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${route} -> ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function runCase(base: string, agentId: string, testCase: IntentCase, timeoutMs: number): Promise<CaseResult> {
  const projectId = `eval_${testCase.id}_${Math.random().toString(36).slice(2, 8)}`;
  const created = await api<{ conversationId: string }>(base, '/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      id: projectId,
      name: `eval ${testCase.id}`,
      metadata: { kind: 'prototype' },
      conversationMode: testCase.mode,
    }),
  });
  const started = await api<{ runId: string }>(base, '/api/runs', {
    method: 'POST',
    body: JSON.stringify({
      projectId,
      conversationId: created.conversationId,
      agentId,
      message: testCase.text,
      sessionMode: testCase.mode,
      clientRequestId: `eval-${projectId}`,
    }),
  });

  const deadline = Date.now() + timeoutMs;
  let status = 'queued';
  while (!TERMINAL.has(status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    status = (await api<{ status: string }>(base, `/api/runs/${started.runId}`)).status;
  }
  if (!TERMINAL.has(status)) {
    await fetch(`${base}/api/runs/${started.runId}/cancel`, { method: 'POST' }).catch(() => undefined);
    return { id: testCase.id, kind: testCase.kind, observed: 'answer', passed: false };
  }

  const delegates = await api<{ delegates: Record<string, unknown[]> }>(
    base,
    `/api/projects/${projectId}/run-delegates?parentRunIds=${started.runId}`,
  );
  const messages = await api<{ messages: Array<{ role: string; content?: string }> }>(
    base,
    `/api/projects/${projectId}/conversations/${created.conversationId}/messages`,
  );
  const files = await api<{ files: Array<{ name: string }> }>(base, `/api/projects/${projectId}/files`).catch(
    () => ({ files: [] as Array<{ name: string }> }),
  );
  const reply = [...messages.messages].reverse().find((m) => m.role === 'assistant')?.content ?? '';
  return scoreCase(testCase, {
    delegateCount: (delegates.delegates[started.runId] ?? []).length,
    replyText: reply,
    wroteRulesFile: files.files.some((f) => f.name === 'ORCHESTRATOR.md'),
  });
}

export async function main(argv: readonly string[]): Promise<number> {
  const options = parseArgs(argv);
  const cases = selectCases(options);
  const base = options.daemonUrl;
  const config = (await api<{ config: { agentId?: string; agentCliEnv?: Record<string, Record<string, string>> } }>(
    base,
    '/api/app-config',
  )).config;
  const agentId = config.agentId;
  if (!agentId) throw new Error('The daemon has no CLI selected; choose one in Settings first.');
  if (agentId === DELEGATE_RUNTIME) {
    throw new Error(`The CLI under test cannot be "${DELEGATE_RUNTIME}": it is the stub the delegates run on.`);
  }
  console.log(`CLI under test: ${agentId}\nCases: ${cases.length}`);
  if (!options.run) {
    console.log('\nThis spends the CLI\'s quota (one turn per case). Add --run to go ahead.');
    return 0;
  }

  const existing = await api<{ profiles: unknown[] }>(base, '/api/agent-profiles');
  if (existing.profiles.length > 0) {
    throw new Error('This daemon already has agents. Run the evaluation against a daemon of its own.');
  }

  const stubDir = await mkdtemp(path.join(os.tmpdir(), 'od-eval-stub-'));
  const stub = path.join(stubDir, DELEGATE_RUNTIME);
  await writeFile(
    stub,
    `#!/usr/bin/env node
if (process.argv.includes('--version')) { console.log('stub 0.0.0'); process.exit(0); }
if (process.argv[2] === 'models') { console.log('stub/model'); process.exit(0); }
process.stdin.resume();
process.stdin.on('end', () => process.exit(0));
setTimeout(() => process.exit(0), 800);
`,
    'utf8',
  );
  await chmod(stub, 0o755);
  const priorEnv = config.agentCliEnv ?? {};
  await api(base, '/api/app-config', {
    method: 'PUT',
    body: JSON.stringify({ agentCliEnv: { ...priorEnv, [DELEGATE_RUNTIME]: { OPENCODE_BIN: stub } } }),
  });
  const profileIds: string[] = [];
  const results: CaseResult[] = [];
  try {
    for (const agent of EVAL_AGENTS) {
      const created = await api<{ profile: { id: string } }>(base, '/api/agent-profiles', {
        method: 'POST',
        body: JSON.stringify({ ...agent, runtimeId: DELEGATE_RUNTIME }),
      });
      profileIds.push(created.profile.id);
    }
    for (const testCase of cases) {
      let result: CaseResult;
      try {
        result = await runCase(base, agentId, testCase, options.timeoutMs);
      } catch (error) {
        console.error(`${testCase.id}: ${(error as Error).message}`);
        result = { id: testCase.id, kind: testCase.kind, observed: 'answer', passed: false };
      }
      results.push(result);
      console.log(`${result.passed ? 'ok  ' : 'FAIL'}  ${testCase.id.padEnd(26)} ${result.observed.padEnd(9)} (accepts ${testCase.accept.join('/')})`);
    }
  } finally {
    for (const id of profileIds) {
      await fetch(`${base}/api/agent-profiles/${id}`, { method: 'DELETE' }).catch(() => undefined);
    }
    await api(base, '/api/app-config', {
      method: 'PUT',
      body: JSON.stringify({ agentCliEnv: priorEnv }),
    }).catch(() => undefined);
    await rm(stubDir, { recursive: true, force: true });
  }

  const summary = summarize(results);
  console.log(`\nAccuracy: ${summary.passed}/${summary.total} (${(summary.accuracy * 100).toFixed(0)}%)`);
  for (const [kind, bucket] of Object.entries(summary.byKind)) {
    console.log(`  ${kind.padEnd(20)} ${bucket.passed}/${bucket.total}`);
  }
  if (summary.overDelegations.length > 0) {
    console.log(`Delegated when it should not have: ${summary.overDelegations.join(', ')}`);
  }
  if (summary.underDelegations.length > 0) {
    console.log(`Did not delegate when told who should do it: ${summary.underDelegations.join(', ')}`);
  }
  if (options.jsonPath) {
    await writeFile(options.jsonPath, `${JSON.stringify({ agentId, summary, results }, null, 2)}\n`, 'utf8');
  }
  return options.minAccuracy !== null && summary.accuracy < options.minAccuracy ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(2);
    },
  );
}
