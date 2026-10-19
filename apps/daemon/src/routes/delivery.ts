import fs from 'node:fs/promises';
import path from 'node:path';
import type { Express } from 'express';
import {
  DELIVERY_FILE_NAME,
  checkDeliveryUpdate,
  parseDeliveryFile,
  summarizeDelivery,
  type DeliveryState,
  type DeliveryStatusResponse,
} from '@open-design/contracts';
import type { RouteDeps } from '../server-context.js';
import type { AuthorizeProjectRequest } from '../collab/project-request-authority.js';

export interface RegisterDeliveryRoutesDeps
  extends RouteDeps<'db' | 'http' | 'paths' | 'projectStore' | 'validation'> {
  authorizeProjectRequest: AuthorizeProjectRequest;
  resolveProjectDir: (
    projectsRoot: string,
    projectId: string,
    metadata?: unknown,
    opts?: { allowUnavailableSandboxImportedProject?: boolean },
  ) => string;
}

/**
 * The last state each project's file was read as. `DELIVERY.json` is written by
 * a model, so every read is compared with the previous one and any edit that
 * deleted, renamed or reworded a stage is reported in `violations` (the file is
 * left alone: the daemon reports, the orchestrator decides).
 */
const lastSeen = new Map<string, DeliveryState>();

/**
 * `GET /api/projects/:id/delivery` — the staged-delivery state of a project, for
 * the UI and for `od delivery status`. No file means `present: false`, not an
 * error: most projects are not deliveries.
 */
export function registerDeliveryRoutes(app: Express, ctx: RegisterDeliveryRoutesDeps) {
  const { db } = ctx;
  const { sendApiError } = ctx.http;
  const { PROJECTS_DIR } = ctx.paths;
  const { getProject } = ctx.projectStore;
  const { isSafeId } = ctx.validation;

  app.get('/api/projects/:id/delivery', async (req, res) => {
    const projectId = req.params.id;
    if (!isSafeId(projectId)) return sendApiError(res, 400, 'BAD_REQUEST', 'invalid project id');
    if (!await ctx.authorizeProjectRequest(req, res, projectId, { mode: 'read' })) return;
    const project = getProject(db, projectId);
    if (!project) return sendApiError(res, 404, 'NOT_FOUND', 'project not found');

    const dir = ctx.resolveProjectDir(PROJECTS_DIR, project.id, project.metadata, {
      allowUnavailableSandboxImportedProject: true,
    });
    let raw: string;
    try {
      raw = await fs.readFile(path.join(dir, DELIVERY_FILE_NAME), 'utf8');
    } catch {
      lastSeen.delete(projectId);
      const none: DeliveryStatusResponse = summarizeDelivery({ state: null, issues: [] });
      return res.json(none);
    }

    const parsed = parseDeliveryFile(raw);
    const body = summarizeDelivery(parsed);
    const before = lastSeen.get(projectId);
    if (parsed.state) {
      if (before) body.violations = checkDeliveryUpdate(before, parsed.state);
      // Only a clean edit becomes the new baseline, so a broken edit keeps being
      // reported until it is put right.
      if (body.violations.length === 0) lastSeen.set(projectId, parsed.state);
    }
    return res.json(body);
  });
}

/** Test seam. */
export function resetDeliverySnapshots(): void {
  lastSeen.clear();
}
