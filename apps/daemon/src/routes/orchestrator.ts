import { randomUUID } from 'node:crypto';

import type { Express, RequestHandler } from 'express';

import type { OrchestratorWorkspaceResponse } from '@open-design/contracts';

import { listConversations, listProjects } from '../db.js';
import type { RouteDeps } from '../server-context.js';

type Db = Parameters<typeof listProjects>[0];

export interface RegisterOrchestratorRoutesDeps extends RouteDeps<'http'> {
  db: Db;
  /** The daemon's own base URL, to create the project through the ordinary route. */
  daemonUrl: () => string;
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

  app.get('/api/orchestrator', requireLocal, async (_req, res) => {
    try {
      const projectId = await ensureProject();
      const sessions = (listConversations(ctx.db, projectId) as Array<{ id: string; title?: string | null; updatedAt?: number; createdAt?: number }>)
        .map((conversation) => ({
          id: conversation.id,
          title: conversation.title ?? null,
          updatedAt: conversation.updatedAt ?? conversation.createdAt ?? 0,
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      const body: OrchestratorWorkspaceResponse = { projectId, sessions };
      res.json(body);
    } catch (error) {
      sendApiError(res, 500, 'INTERNAL', error instanceof Error ? error.message : String(error));
    }
  });
}
