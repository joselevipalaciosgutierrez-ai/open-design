import { useEffect, useState } from 'react';
import type { AgentProfile } from '@open-design/contracts';
import { useI18n } from '../i18n';
import styles from './McpScopeSelect.module.css';

interface ScopeData {
  agentOnly: Record<string, string[]>;
  agents: AgentProfile[];
}

// One fetch shared by every row on the page.
let shared: Promise<ScopeData> | null = null;
function loadScopeData(): Promise<ScopeData> {
  if (!shared) {
    shared = Promise.all([
      fetch('/api/mcp-scopes').then((r) => (r.ok ? r.json() : { agentOnly: {} })),
      fetch('/api/agent-profiles').then((r) => (r.ok ? r.json() : { profiles: [] })),
    ])
      .then(([scopes, profiles]) => ({
        agentOnly: (scopes as { agentOnly?: Record<string, string[]> }).agentOnly ?? {},
        agents: (profiles as { profiles?: AgentProfile[] }).profiles ?? [],
      }))
      .catch(() => ({ agentOnly: {}, agents: [] }));
  }
  return shared;
}

/** For tests: forget the shared fetch. */
export function resetMcpScopeCache(): void {
  shared = null;
}

/**
 * Who gets this MCP server: every agent (global, the default) or only one.
 * Saved at once; it applies from the next message. Several agents can be set
 * with `od mcp scope <id> --agent a,b`.
 */
export function McpScopeSelect({ serverId }: { serverId: string }) {
  const { locale } = useI18n();
  const es = locale.toLowerCase().startsWith('es');
  const [data, setData] = useState<ScopeData | null>(null);

  useEffect(() => {
    let alive = true;
    void loadScopeData().then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!serverId || !data) return null;
  const owners = data.agentOnly[serverId] ?? [];
  const value = owners.length === 1 ? owners[0]! : owners.length > 1 ? '__several' : '';

  const change = async (next: string) => {
    const agentIds = next ? [next] : null;
    try {
      const resp = await fetch('/api/mcp-scopes', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serverId, agentIds }),
      });
      if (!resp.ok) return;
      const scopes = (await resp.json()) as { agentOnly?: Record<string, string[]> };
      const updated = { ...data, agentOnly: scopes.agentOnly ?? {} };
      shared = Promise.resolve(updated);
      setData(updated);
    } catch {
      // Left as it was.
    }
  };

  return (
    <select
      className={styles.select}
      value={value}
      aria-label={es ? 'Quién usa este MCP' : 'Who uses this MCP'}
      title={es ? 'Global: todos los agentes. Un agente: solo ese lo recibe.' : 'Global: every agent. One agent: only that one gets it.'}
      onChange={(e) => void change(e.target.value)}
      data-testid="mcp-scope-select"
    >
      <option value="">{es ? 'Todos los agentes' : 'Every agent'}</option>
      {value === '__several' ? <option value="__several" disabled>{es ? 'Varios agentes' : 'Several agents'}</option> : null}
      {data.agents.map((agent) => (
        <option key={agent.id} value={agent.id}>
          {es ? `Solo ${agent.name}` : `Only ${agent.name}`}
        </option>
      ))}
    </select>
  );
}
