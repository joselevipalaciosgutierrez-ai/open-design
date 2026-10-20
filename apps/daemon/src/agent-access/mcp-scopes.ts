/**
 * Which agents get each external MCP server. A server is global (every agent
 * and the default assistant get it) unless it is listed here with the agent
 * profiles it belongs to; then only runs of those agents get it. Same rule as
 * skills (skill-scopes.ts): kept in the daemon's data root, changed only
 * through an endpoint the agent gateway refuses.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';

export const MCP_SCOPES_FILE = 'mcp-scopes.json';

export interface McpScopes {
  /** serverId → the agent profile ids that may use it. Absent = global. */
  agentOnly: Record<string, string[]>;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

export function normalizeMcpScopes(raw: unknown): McpScopes {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const source = record.agentOnly && typeof record.agentOnly === 'object' && !Array.isArray(record.agentOnly)
    ? (record.agentOnly as Record<string, unknown>)
    : {};
  const agentOnly: Record<string, string[]> = {};
  for (const [serverId, agents] of Object.entries(source)) {
    if (!ID.test(serverId) || !Array.isArray(agents)) continue;
    const ids = [...new Set(agents.filter((a): a is string => typeof a === 'string' && ID.test(a)))];
    if (ids.length > 0) agentOnly[serverId] = ids;
  }
  return { agentOnly };
}

/**
 * The servers one run gets: the global ones, plus those that belong to the
 * run's agent. A run with no agent (the default assistant) gets the global
 * ones only.
 */
export function mcpServersForAgent<T extends { id: string }>(
  servers: readonly T[],
  scopes: McpScopes,
  agentProfileId: string | null | undefined,
): T[] {
  return servers.filter((server) => {
    const owners = scopes.agentOnly[server.id];
    if (!owners) return true;
    return typeof agentProfileId === 'string' && owners.includes(agentProfileId);
  });
}

export function createMcpScopesStore(options: { dataDir: string }) {
  const file = path.join(options.dataDir, MCP_SCOPES_FILE);

  async function read(): Promise<McpScopes> {
    try {
      return normalizeMcpScopes(JSON.parse(await fsp.readFile(file, 'utf8')));
    } catch {
      return { agentOnly: {} };
    }
  }

  /** `agentIds` null or empty makes the server global again. */
  async function setScope(serverId: string, agentIds: string[] | null): Promise<McpScopes> {
    const current = await read();
    const next = { agentOnly: { ...current.agentOnly } };
    if (agentIds && agentIds.length > 0) next.agentOnly[serverId] = agentIds;
    else delete next.agentOnly[serverId];
    const clean = normalizeMcpScopes(next);
    await fsp.mkdir(options.dataDir, { recursive: true });
    await fsp.writeFile(file, `${JSON.stringify(clean, null, 2)}\n`, 'utf8');
    return clean;
  }

  return { file, read, setScope };
}

export type McpScopesStore = ReturnType<typeof createMcpScopesStore>;
