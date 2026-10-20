import type { Express } from 'express';

import type { AgentDraftResponse } from '@open-design/contracts';

import { AGENT_DRAFT_SYSTEM, basicDraft, parseDraftReply, suggestSkillsFor, type DraftSkill } from '../agent-draft.js';
import type { RouteDeps } from '../server-context.js';

export interface RegisterAgentDraftRoutesDeps extends RouteDeps<'http'> {
  listSkills: () => Promise<DraftSkill[]>;
  globalSkillIds: () => Promise<string[]>;
  /** One short model call (memory-llm `oneShotText`); null when none is available. */
  ask: (input: { system: string; user: string; runtimeId: string | null }) => Promise<string | null>;
}

/** POST /api/agent-profiles/draft — see agent-draft.ts. The agent gateway refuses it (non-GET agent-profiles). */
export function registerAgentDraftRoutes(app: Express, ctx: RegisterAgentDraftRoutesDeps) {
  const { sendApiError } = ctx.http;
  app.post('/api/agent-profiles/draft', async (req, res) => {
    const body = (req.body ?? {}) as { name?: unknown; description?: unknown; runtimeId?: unknown };
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 600) : '';
    if (description.length < 4) return sendApiError(res, 400, 'BAD_REQUEST', 'description is required');
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
    const runtimeId = typeof body.runtimeId === 'string' && body.runtimeId ? body.runtimeId : null;
    const [skills, globalIds, reply] = await Promise.all([
      ctx.listSkills().catch(() => [] as DraftSkill[]),
      ctx.globalSkillIds().catch(() => [] as string[]),
      ctx.ask({ system: AGENT_DRAFT_SYSTEM, user: `${name ? `Name: ${name}\n` : ''}Description: ${description}`, runtimeId }),
    ]);
    const drafted = parseDraftReply(reply);
    const draft: AgentDraftResponse = {
      ...(drafted ?? basicDraft(description)),
      suggestedSkillIds: suggestSkillsFor(`${name} ${description}`, skills, globalIds),
      source: drafted ? 'model' : 'basic',
    };
    res.json(draft);
  });
}
