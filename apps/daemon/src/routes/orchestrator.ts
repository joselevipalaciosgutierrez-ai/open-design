import { randomUUID } from 'node:crypto';

import type { Express, RequestHandler } from 'express';

import { promises as fsp } from 'node:fs';
import path from 'node:path';

import type { OrchestratorOrder, OrchestratorOrdersResponse, OrchestratorWorkspaceResponse } from '@open-design/contracts';

import { readAgentStatsSync } from '../agent-stats.js';
import { countMessages, getConversation, getProject, listConversations, listMessages, listProjects } from '../db.js';
import type { RouteDeps } from '../server-context.js';

type Db = Parameters<typeof listProjects>[0];

export interface RegisterOrchestratorRoutesDeps extends RouteDeps<'http'> {
  db: Db;
  /** The daemon's own base URL, to create the project through the ordinary route. */
  daemonUrl: () => string;
  /** Runs in memory (this daemon's lifetime). */
  listRuns: () => Array<OrderRunRecord>;
  /** Where each run's persisted state lives (`<dir>/<runId>/state.json`). */
  runsDir: string;
  /** The daemon's data root (agent track records). */
  dataDir: string;
}

/** The fields of a run (in memory or persisted) that make an order. */
export interface OrderRunRecord {
  id: string;
  projectId?: string | null;
  conversationId?: string | null;
  agentId?: string | null;
  status?: string;
  createdAt?: number;
  terminalAt?: number | null;
  delegation?: { parentRunId?: string; rootRunId?: string } | null;
}

/** The runs a Lev turn started, directly or through its delegates, oldest first. */
export function ordersOf(runId: string, runs: OrderRunRecord[]): OrderRunRecord[] {
  const seen = new Set<string>();
  return runs
    .filter((run) => run.delegation?.rootRunId === runId || run.delegation?.parentRunId === runId)
    .filter((run) => (seen.has(run.id) ? false : (seen.add(run.id), true)))
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

async function persistedRuns(runsDir: string): Promise<OrderRunRecord[]> {
  let names: string[] = [];
  try {
    names = await fsp.readdir(runsDir);
  } catch {
    return [];
  }
  const records: OrderRunRecord[] = [];
  for (const name of names) {
    try {
      const state = JSON.parse(await fsp.readFile(path.join(runsDir, name, 'state.json'), 'utf8')) as OrderRunRecord;
      if (state?.delegation && typeof state.id === 'string') records.push(state);
    } catch {
      // Not a run folder, or no state yet.
    }
  }
  return records;
}

/** The hidden system project that holds Lev's sessions, if it exists. */
export function findOrchestratorProjectId(db: Db): string | null {
  const project = (listProjects(db) as Array<{ id: string; metadata?: { system?: string } | null }>).find(
    (candidate) => candidate.metadata?.system === 'orchestrator',
  );
  return project?.id ?? null;
}

/**
 * Lev's space:
 *   GET /api/orchestrator   the system project and its sessions; created on first use
 * Sessions are the project's conversations, created and listed through the
 * ordinary conversation routes. The project is created through the ordinary
 * `POST /api/projects`, so it gets the same folder, binding and defaults as any
 * other, and is kept out of project lists by its `system` metadata.
 */
export function registerOrchestratorRoutes(app: Express, ctx: RegisterOrchestratorRoutesDeps) {
  const { sendApiError } = ctx.http;
  const requireLocal = (ctx.http as unknown as { requireLocalDaemonRequest: RequestHandler }).requireLocalDaemonRequest;
  // One creation at a time, so two first calls do not make two projects.
  let creating: Promise<string> | null = null;

  const ensureProject = async (): Promise<string> => {
    const existing = findOrchestratorProjectId(ctx.db);
    if (existing) return existing;
    creating ??= (async () => {
      try {
        const resp = await fetch(`${ctx.daemonUrl()}/api/projects`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            id: randomUUID(),
            name: 'Lev',
            skillId: null,
            designSystemId: null,
            sessionMode: 'chat',
            metadata: { kind: 'other', system: 'orchestrator', nameSource: 'user' },
          }),
        });
        if (!resp.ok) throw new Error(`project create failed (${resp.status})`);
        const created = (await resp.json()) as { project?: { id?: string } };
        const id = created.project?.id ?? findOrchestratorProjectId(ctx.db);
        if (!id) throw new Error('project create returned no id');
        return id;
      } finally {
        creating = null;
      }
    })();
    return creating;
  };

  // Each agent's track record (agent-stats.ts), for `od agent show` and the app.
  app.get('/api/agent-stats', async (_req, res) => {
    res.json({ stats: readAgentStatsSync(ctx.dataDir) });
  });

  app.get('/api/orchestrator/orders', requireLocal, async (req, res) => {
    const runId = typeof req.query.runId === 'string' ? req.query.runId : '';
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(runId)) return sendApiError(res, 400, 'BAD_REQUEST', 'runId is required');
    let found = ordersOf(runId, ctx.listRuns());
    // After a restart the in-memory runs are gone; their persisted state is not.
    if (found.length === 0) found = ordersOf(runId, await persistedRuns(ctx.runsDir));
    const orders: OrchestratorOrder[] = found
      .filter((run) => typeof run.projectId === 'string' && run.projectId)
      .map((run) => {
        const project = getProject(ctx.db, run.projectId as string) as { name?: string } | null;
        const conversation = run.conversationId
          ? (getConversation(ctx.db, run.conversationId) as { title?: string | null } | null)
          : null;
        return {
          runId: run.id,
          projectId: run.projectId as string,
          projectName: project?.name ?? null,
          conversationId: run.conversationId ?? null,
          conversationTitle: conversation?.title ?? null,
          agentId: run.agentId ?? null,
          status: run.status ?? 'unknown',
          createdAt: run.createdAt ?? 0,
          terminalAt: run.terminalAt ?? null,
        };
      });
    const body: OrchestratorOrdersResponse = { orders };
    res.json(body);
  });

  app.get('/api/orchestrator', requireLocal, async (_req, res) => {
    try {
      const projectId = await ensureProject();
      const sessions = (listConversations(ctx.db, projectId) as Array<{ id: string; title?: string | null; updatedAt?: number; createdAt?: number }>)
        .map((conversation) => {
          const messageCount = countMessages(ctx.db, conversation.id);
          const firstUser = messageCount > 0
            ? (listMessages(ctx.db, conversation.id) as Array<{ role?: string; content?: string }>).find((m) => m.role === 'user')
            : undefined;
          const preview = typeof firstUser?.content === 'string'
            ? firstUser.content.replace(/\s+/g, ' ').trim().slice(0, 80) || null
            : null;
          return {
            id: conversation.id,
            title: conversation.title ?? null,
            preview,
            messageCount,
            updatedAt: conversation.updatedAt ?? conversation.createdAt ?? 0,
          };
        })
        // An empty session (opened but never written in) is not worth offering.
        .filter((session) => session.messageCount > 0)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      const body: OrchestratorWorkspaceResponse = { projectId, sessions };
      res.json(body);
    } catch (error) {
      sendApiError(res, 500, 'INTERNAL', error instanceof Error ? error.message : String(error));
    }
  });
}
