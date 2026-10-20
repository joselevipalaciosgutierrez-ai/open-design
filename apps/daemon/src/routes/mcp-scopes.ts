import type { Express, RequestHandler } from 'express';

import type { McpScopesStore } from '../agent-access/mcp-scopes.js';
import type { RouteDeps } from '../server-context.js';

export interface RegisterMcpScopeRoutesDeps extends RouteDeps<'http'> {
  scopes: McpScopesStore;
}

/**
 * Which agents get each external MCP server:
 *   GET /api/mcp-scopes   { agentOnly: { serverId: [agentProfileId…] } }
 *   PUT /api/mcp-scopes   { serverId, agentIds: [...] | null }  (null or [] = global)
 * The agent gateway refuses both: an agent cannot give itself a server.
 */
export function registerMcpScopeRoutes(app: Express, ctx: RegisterMcpScopeRoutesDeps) {
  const { sendApiError } = ctx.http;
  const requireLocal = (ctx.http as unknown as { requireLocalDaemonRequest: RequestHandler }).requireLocalDaemonRequest;

  app.get('/api/mcp-scopes', requireLocal, async (_req, res) => {
    res.json(await ctx.scopes.read());
  });

  app.put('/api/mcp-scopes', requireLocal, async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.serverId !== 'string' || !body.serverId) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'serverId is required');
    }
    const agentIds = Array.isArray(body.agentIds)
      ? body.agentIds.filter((id): id is string => typeof id === 'string')
      : null;
    res.json(await ctx.scopes.setScope(body.serverId, agentIds));
  });
}
