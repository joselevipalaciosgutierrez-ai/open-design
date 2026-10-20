import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createMcpScopesStore, mcpServersForAgent, normalizeMcpScopes } from '../../src/agent-access/mcp-scopes.js';
import { buildAntigravityMcpPlugin, buildCodexMcpConfigArgs } from '../../src/mcp-config.js';
import { antigravityAgentDef } from '../../src/runtimes/defs/antigravity.js';
import { codexAgentDef } from '../../src/runtimes/defs/codex.js';
import type { McpServerConfig } from '@open-design/contracts';

const figma: McpServerConfig = { id: 'figma', transport: 'stdio', enabled: true, command: 'npx', args: ['-y', 'figma-mcp'], env: { FIGMA_TOKEN: 'secret "x"' } };
const linear: McpServerConfig = { id: 'linear', transport: 'http', enabled: true, url: 'https://mcp.linear.app/mcp', headers: { Authorization: 'Bearer abc' } };
const oldSse: McpServerConfig = { id: 'old', transport: 'sse', enabled: true, url: 'https://x.example/sse' };
const off: McpServerConfig = { id: 'off', transport: 'stdio', enabled: false, command: 'nope' };

describe('MCP scopes', () => {
  it('gives global servers to everyone and agent-only ones to their agents', () => {
    const scopes = normalizeMcpScopes({ agentOnly: { figma: ['design-agent'], bad: 'x' } });
    expect(scopes).toEqual({ agentOnly: { figma: ['design-agent'] } });
    expect(mcpServersForAgent([figma, linear], scopes, 'design-agent').map((s) => s.id)).toEqual(['figma', 'linear']);
    expect(mcpServersForAgent([figma, linear], scopes, 'dev-agent').map((s) => s.id)).toEqual(['linear']);
    expect(mcpServersForAgent([figma, linear], scopes, null).map((s) => s.id)).toEqual(['linear']);
  });

  it('saves a scope and makes a server global again', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mcp-scopes-'));
    const store = createMcpScopesStore({ dataDir: dir });
    expect(await store.setScope('figma', ['a1', 'a2'])).toEqual({ agentOnly: { figma: ['a1', 'a2'] } });
    expect(await store.setScope('figma', null)).toEqual({ agentOnly: {} });
    await fsp.rm(dir, { recursive: true, force: true });
  });
});

describe('MCP for Codex', () => {
  it('turns servers into -c mcp_servers overrides, skipping SSE and disabled ones', () => {
    const args = buildCodexMcpConfigArgs([figma, linear, oldSse, off]);
    expect(args).toEqual([
      '-c', 'mcp_servers.figma.command="npx"',
      '-c', 'mcp_servers.figma.args=["-y","figma-mcp"]',
      '-c', 'mcp_servers.figma.env={ "FIGMA_TOKEN" = "secret \\"x\\"" }',
      '-c', 'mcp_servers.linear.url="https://mcp.linear.app/mcp"',
      '-c', 'mcp_servers.linear.http_headers={ "Authorization" = "Bearer abc" }',
    ]);
  });

  it('puts them before the resume id', () => {
    const args = codexAgentDef.buildArgs('p', [], [], {}, { resumeSessionId: 'thread-1', mcpConfigArgs: ['-c', 'mcp_servers.a.command="x"'] });
    expect(args.at(-1)).toBe('thread-1');
    expect(args.indexOf('mcp_servers.a.command="x"')).toBeLessThan(args.length - 1);
    expect(codexAgentDef.externalMcpInjection).toBe('codex-config-overrides');
  });
});

describe('MCP for Antigravity', () => {
  it('writes a workspace plugin with stdio and streamable-HTTP servers', () => {
    const plugin = buildAntigravityMcpPlugin([figma, linear, oldSse, off])!;
    expect(plugin.pluginJson).toMatchObject({ name: 'od-mcp' });
    expect(plugin.mcpConfig).toEqual({
      mcpServers: {
        figma: { command: 'npx', args: ['-y', 'figma-mcp'], env: { FIGMA_TOKEN: 'secret "x"' } },
        linear: { url: 'https://mcp.linear.app/mcp', headers: { Authorization: 'Bearer abc' } },
      },
    });
    expect(buildAntigravityMcpPlugin([oldSse, off])).toBeNull();
    expect(antigravityAgentDef.externalMcpInjection).toBe('antigravity-workspace-plugin');
  });
});
