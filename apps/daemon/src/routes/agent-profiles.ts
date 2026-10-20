import type { Express, Response } from 'express';
import {
  AGENT_PROFILE_EMOJI_MAX,
  AGENT_PROFILE_INSTRUCTIONS_MAX,
  AGENT_PROFILE_MODEL_MAX,
  AGENT_PROFILE_NAME_MAX,
  AGENT_PROFILE_ROLE_MAX,
  AGENT_PROFILE_SKILL_IDS_MAX,
  type AgentProfileInput,
  type AgentProfileResponse,
  type AgentProfilesResponse,
} from '@open-design/contracts';
import {
  normalizeAgentCard,
  deleteAgentProfile,
  getAgentProfile,
  insertAgentProfile,
  listAgentProfiles,
  updateAgentProfile,
} from '../db.js';

type Db = Parameters<typeof listAgentProfiles>[0];

export interface RegisterAgentProfileRoutesDeps {
  db: Db;
  http: {
    sendApiError: (
      res: Response,
      status: number,
      code: string,
      message: string,
      extra?: unknown,
    ) => unknown;
  };
  agents: { getAgentDef: (id: string) => unknown };
  ids: { randomId: () => string };
}

type Parsed =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string };

function optionalText(
  body: Record<string, unknown>,
  key: string,
  max: number,
  out: Record<string, unknown>,
): string | null {
  if (!Object.prototype.hasOwnProperty.call(body, key)) return null;
  const raw = body[key];
  if (raw === null) {
    out[key] = null;
    return null;
  }
  if (typeof raw !== 'string') return `${key} must be a string or null`;
  const trimmed = raw.trim();
  if (trimmed.length > max) return `${key} must be ${max} characters or fewer`;
  out[key] = trimmed || null;
  return null;
}

/**
 * Validate a create/update body. On update (`partial`) only the fields that are
 * present are checked and returned, so an omitted field is left unchanged.
 */
export function parseAgentProfileInput(raw: unknown, partial: boolean): Parsed {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'name')) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return { ok: false, message: 'name required' };
    }
    const name = body.name.trim();
    if (name.length > AGENT_PROFILE_NAME_MAX) {
      return { ok: false, message: `name must be ${AGENT_PROFILE_NAME_MAX} characters or fewer` };
    }
    out.name = name;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'runtimeId')) {
    if (typeof body.runtimeId !== 'string' || !body.runtimeId.trim()) {
      return { ok: false, message: 'runtimeId required' };
    }
    out.runtimeId = body.runtimeId.trim();
  }

  for (const [key, max] of [
    ['role', AGENT_PROFILE_ROLE_MAX],
    ['emoji', AGENT_PROFILE_EMOJI_MAX],
    ['model', AGENT_PROFILE_MODEL_MAX],
    ['instructions', AGENT_PROFILE_INSTRUCTIONS_MAX],
    ['designSystemId', 200],
  ] as const) {
    const problem = optionalText(body, key, max, out);
    if (problem) return { ok: false, message: problem };
  }

  if (Object.prototype.hasOwnProperty.call(body, 'skillIds')) {
    const ids = body.skillIds;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
      return { ok: false, message: 'skillIds must be an array of strings' };
    }
    if (ids.length > AGENT_PROFILE_SKILL_IDS_MAX) {
      return {
        ok: false,
        message: `skillIds must have ${AGENT_PROFILE_SKILL_IDS_MAX} entries or fewer`,
      };
    }
    out.skillIds = [...new Set(ids.map((id: string) => id.trim()).filter(Boolean))];
  }

  // The card the orchestrator reads (goodFor / notFor / delivers), short prose.
  if (Object.prototype.hasOwnProperty.call(body, 'card')) {
    const card = body.card;
    if (card === null || typeof card !== 'object' || Array.isArray(card)) {
      return { ok: false, message: 'card must be an object with goodFor, notFor, delivers' };
    }
    out.card = normalizeAgentCard(card);
  }

  return { ok: true, value: out };
}

export function registerAgentProfileRoutes(app: Express, ctx: RegisterAgentProfileRoutesDeps): void {
  const { db } = ctx;
  const { sendApiError } = ctx.http;
  const { getAgentDef } = ctx.agents;
  const { randomId } = ctx.ids;

  app.get('/api/agent-profiles', (_req, res) => {
    const payload: AgentProfilesResponse = { profiles: listAgentProfiles(db) };
    res.json(payload);
  });

  app.get('/api/agent-profiles/:id', (req, res) => {
    const profile = getAgentProfile(db, req.params.id);
    if (!profile) return sendApiError(res, 404, 'NOT_FOUND', 'agent profile not found');
    const payload: AgentProfileResponse = { profile };
    res.json(payload);
  });

  app.post('/api/agent-profiles', (req, res) => {
    const parsed = parseAgentProfileInput(req.body, false);
    if (!parsed.ok) return sendApiError(res, 400, 'BAD_REQUEST', parsed.message);
    const input = parsed.value as AgentProfileInput;
    if (!getAgentDef(String(input.runtimeId))) {
      return sendApiError(res, 400, 'BAD_REQUEST', `unknown runtime: ${String(input.runtimeId)}`);
    }
    const now = Date.now();
    const profile = insertAgentProfile(db, {
      id: randomId(),
      ...parsed.value,
      createdAt: now,
      updatedAt: now,
    });
    const payload: AgentProfileResponse = { profile: profile! };
    res.status(201).json(payload);
  });

  app.patch('/api/agent-profiles/:id', (req, res) => {
    if (!getAgentProfile(db, req.params.id)) {
      return sendApiError(res, 404, 'NOT_FOUND', 'agent profile not found');
    }
    const parsed = parseAgentProfileInput(req.body, true);
    if (!parsed.ok) return sendApiError(res, 400, 'BAD_REQUEST', parsed.message);
    const input = parsed.value as AgentProfileInput;
    if (input.runtimeId !== undefined && !getAgentDef(input.runtimeId)) {
      return sendApiError(res, 400, 'BAD_REQUEST', `unknown runtime: ${input.runtimeId}`);
    }
    const profile = updateAgentProfile(db, req.params.id, parsed.value);
    const payload: AgentProfileResponse = { profile: profile! };
    res.json(payload);
  });

  app.delete('/api/agent-profiles/:id', (req, res) => {
    if (!getAgentProfile(db, req.params.id)) {
      return sendApiError(res, 404, 'NOT_FOUND', 'agent profile not found');
    }
    deleteAgentProfile(db, req.params.id);
    res.json({ ok: true });
  });
}
