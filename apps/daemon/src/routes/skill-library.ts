import { promises as fsp } from 'node:fs';
import path from 'node:path';

import type { Express, RequestHandler } from 'express';

import { getAgentProfile, updateAgentProfile } from '../db.js';
import { discoverCliSkills, isDiscoverableSkillDir } from '../agent-access/skill-discovery.js';
import type { SkillScopesStore } from '../agent-access/skill-scopes.js';
import { slugifySkillName } from '../skills.js';
import type { RouteDeps } from '../server-context.js';

type Db = Parameters<typeof getAgentProfile>[0];

export interface RegisterSkillLibraryRoutesDeps extends RouteDeps<'http'> {
  db: Db;
  scopes: SkillScopesStore;
  userSkillsDir: string;
  home: string;
  /** Ids of every skill in the app's library. */
  listSkillIds: () => Promise<string[]>;
}

/**
 * Who may use which skill, and bringing in skills installed in the CLIs:
 *   GET  /api/skill-scopes                 the global skills
 *   PUT  /api/skill-scopes                 { id, global }: make a skill global or not
 *   GET  /api/skill-library/discover       skills found in the CLIs' own folders
 *   POST /api/skill-library/import         { path, scope: 'global'|'library'|'agent', agentId? }
 * The agent gateway refuses all of these: an agent cannot widen its own skills.
 */
export function registerSkillLibraryRoutes(app: Express, ctx: RegisterSkillLibraryRoutesDeps) {
  const { sendApiError } = ctx.http;
  const requireLocal = (ctx.http as unknown as { requireLocalDaemonRequest: RequestHandler }).requireLocalDaemonRequest;

  app.get('/api/skill-scopes', requireLocal, async (_req, res) => {
    res.json(await ctx.scopes.read());
  });

  app.put('/api/skill-scopes', requireLocal, async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.id !== 'string' || typeof body.global !== 'boolean') {
      return sendApiError(res, 400, 'BAD_REQUEST', 'id (string) and global (boolean) are required');
    }
    if (body.global && !(await ctx.listSkillIds()).includes(body.id)) {
      return sendApiError(res, 404, 'NOT_FOUND', `no skill "${body.id}" in the library`);
    }
    res.json(await ctx.scopes.setGlobal(body.id, body.global));
  });

  app.get('/api/skill-library/discover', requireLocal, async (_req, res) => {
    const [found, ids] = await Promise.all([discoverCliSkills(ctx.home), ctx.listSkillIds()]);
    res.json({
      skills: found.map((skill) => ({ ...skill, imported: ids.includes(slugifySkillName(skill.name)) })),
    });
  });

  app.post('/api/skill-library/import', requireLocal, async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const source = typeof body.path === 'string' ? body.path : '';
    const scope = body.scope === 'global' || body.scope === 'agent' ? body.scope : 'library';
    if (!source || !isDiscoverableSkillDir(source, ctx.home)) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'path must be a skill folder found by /api/skill-library/discover');
    }
    const agentId = typeof body.agentId === 'string' ? body.agentId : '';
    const profile = scope === 'agent' ? getAgentProfile(ctx.db, agentId) : null;
    if (scope === 'agent' && !profile) return sendApiError(res, 404, 'NOT_FOUND', 'no such agent');

    let text: string;
    try {
      text = await fsp.readFile(path.join(source, 'SKILL.md'), 'utf8');
    } catch {
      return sendApiError(res, 400, 'BAD_REQUEST', 'that folder has no SKILL.md');
    }
    const name = /^name:\s*['"]?([^'"\n]+)['"]?\s*$/m.exec(text)?.[1]?.trim() || path.basename(source);
    const id = slugifySkillName(name);
    if (!id) return sendApiError(res, 400, 'BAD_REQUEST', 'the skill name gives no valid id');
    if ((await ctx.listSkillIds()).includes(id)) {
      return sendApiError(res, 409, 'CONFLICT', `a skill "${id}" is already in the library`);
    }
    const target = path.join(ctx.userSkillsDir, id);
    await fsp.mkdir(ctx.userSkillsDir, { recursive: true });
    // A copy, not a link: the app's library is the one that agents use from now on.
    await fsp.cp(source, target, { recursive: true, dereference: true, errorOnExist: true, force: false });

    if (scope === 'global') await ctx.scopes.setGlobal(id, true);
    if (scope === 'agent' && profile) {
      updateAgentProfile(ctx.db, profile.id, { skillIds: [...new Set([...profile.skillIds, id])] });
    }
    res.status(201).json({ id, scope, ...(scope === 'agent' ? { agentId: profile!.id } : {}) });
  });
}
