import type { Express, RequestHandler } from 'express';

import type { MacControlAction, UpdateAgentAccessRequest } from '@open-design/contracts';

import type { AgentAccessStore } from '../agent-access/access-store.js';
import type { MacControl } from '../agent-access/mac-control.js';
import { agentSandboxEnforced } from '../agent-access/sandbox-profile.js';
import type { RouteDeps } from '../server-context.js';

export interface RegisterAgentAccessRoutesDeps extends RouteDeps<'http'> {
  access: AgentAccessStore;
  mac: MacControl;
}

/**
 * What agents may touch, and the Mac control they may use:
 *   GET  /api/agent-access   the settings, and whether they are enforced here
 *   PUT  /api/agent-access   change them (the app only: agents reach the daemon
 *                            through a gateway that refuses this path)
 *   GET  /api/mac/status     Mac control on or off, and macOS's Accessibility answer
 *   POST /api/mac/act        open / type / key / click / screenshot / front-app
 */
export function registerAgentAccessRoutes(app: Express, ctx: RegisterAgentAccessRoutesDeps) {
  const { sendApiError } = ctx.http;
  const requireLocal = (ctx.http as unknown as { requireLocalDaemonRequest: RequestHandler }).requireLocalDaemonRequest;
  const { access, mac } = ctx;

  app.get('/api/agent-access', requireLocal, async (_req, res) => {
    res.json({ access: await access.read(), enforced: agentSandboxEnforced() });
  });

  app.put('/api/agent-access', requireLocal, async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: UpdateAgentAccessRequest = {};
    if (Array.isArray(body.allowedDirs)) patch.allowedDirs = body.allowedDirs.filter((d): d is string => typeof d === 'string');
    if (typeof body.readWholeMac === 'boolean') patch.readWholeMac = body.readWholeMac;
    if (typeof body.macControl === 'boolean') patch.macControl = body.macControl;
    try {
      const next = await access.update(patch);
      res.json({ access: next.access, enforced: agentSandboxEnforced(), refused: next.refused });
    } catch {
      sendApiError(res, 500, 'INTERNAL', 'The access settings could not be saved.');
    }
  });

  app.get('/api/mac/status', requireLocal, async (_req, res) => {
    res.json(await mac.status());
  });

  app.post('/api/mac/act', requireLocal, async (req, res) => {
    const action = parseMacAction(req.body);
    if (!action) return sendApiError(res, 400, 'BAD_REQUEST', 'action must be open, type, key, click, screenshot or front-app');
    const result = await mac.act(action);
    res.status(result.ok ? 200 : 409).json(result);
  });
}

export function parseMacAction(raw: unknown): MacControlAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  switch (body.action) {
    case 'open': {
      const app = typeof body.app === 'string' && body.app.trim() ? body.app.trim() : undefined;
      const url = typeof body.url === 'string' && body.url.trim() ? body.url.trim() : undefined;
      return { action: 'open', ...(app ? { app } : {}), ...(url ? { url } : {}) };
    }
    case 'type':
      return typeof body.text === 'string' && body.text.length > 0 && body.text.length <= 2000
        ? { action: 'type', text: body.text }
        : null;
    case 'key':
      return typeof body.combo === 'string' && body.combo.trim() ? { action: 'key', combo: body.combo.trim() } : null;
    case 'click':
      return typeof body.x === 'number' && typeof body.y === 'number' ? { action: 'click', x: body.x, y: body.y } : null;
    case 'screenshot':
      return { action: 'screenshot' };
    case 'front-app':
      return { action: 'front-app' };
    default:
      return null;
  }
}
