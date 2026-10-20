import type { Express } from 'express';

import type { ProjectNotebookResponse } from '@open-design/contracts';

import { getProject } from '../db.js';
import { addNotebookNote, readNotebook, writeNotebook } from '../notebook.js';
import type { RouteDeps } from '../server-context.js';

type Db = Parameters<typeof getProject>[0];

export interface RegisterNotebookRoutesDeps extends RouteDeps<'http'> {
  db: Db;
  dataDir: string;
}

/** A project's notebook (see notebook.ts), for the person, Lev and the project's agents. */
export function registerNotebookRoutes(app: Express, ctx: RegisterNotebookRoutesDeps) {
  const { sendApiError } = ctx.http;
  const known = (id: string) => /^[A-Za-z0-9_-]{1,120}$/.test(id) && !!getProject(ctx.db, id);

  app.get('/api/projects/:id/notebook', async (req, res) => {
    if (!known(req.params.id)) return sendApiError(res, 404, 'NOT_FOUND', 'project not found');
    const body: ProjectNotebookResponse = { projectId: req.params.id, text: await readNotebook(ctx.dataDir, req.params.id) };
    res.json(body);
  });

  app.put('/api/projects/:id/notebook', async (req, res) => {
    if (!known(req.params.id)) return sendApiError(res, 404, 'NOT_FOUND', 'project not found');
    const text = (req.body ?? {}).text;
    if (typeof text !== 'string' || text.length > 200_000) return sendApiError(res, 400, 'BAD_REQUEST', 'text (string) is required');
    await writeNotebook(ctx.dataDir, req.params.id, text);
    const body: ProjectNotebookResponse = { projectId: req.params.id, text: await readNotebook(ctx.dataDir, req.params.id) };
    res.json(body);
  });

  app.post('/api/projects/:id/notebook/notes', async (req, res) => {
    if (!known(req.params.id)) return sendApiError(res, 404, 'NOT_FOUND', 'project not found');
    const { note, by } = (req.body ?? {}) as { note?: unknown; by?: unknown };
    if (typeof note !== 'string' || !note.trim()) return sendApiError(res, 400, 'BAD_REQUEST', 'note (string) is required');
    await addNotebookNote(ctx.dataDir, req.params.id, note, typeof by === 'string' && by.trim() ? by.trim().slice(0, 40) : 'Lev');
    const body: ProjectNotebookResponse = { projectId: req.params.id, text: await readNotebook(ctx.dataDir, req.params.id) };
    res.status(201).json(body);
  });
}
