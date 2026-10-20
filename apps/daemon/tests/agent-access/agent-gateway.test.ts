import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isBlockedForAgents, startAgentGateway, type AgentGateway } from '../../src/agent-access/agent-gateway.js';

describe('isBlockedForAgents', () => {
  it('refuses the access settings however the path is spelled', () => {
    expect(isBlockedForAgents('/api/agent-access')).toBe(true);
    expect(isBlockedForAgents('/api/agent-access?x=1')).toBe(true);
    expect(isBlockedForAgents('//api//agent-access')).toBe(true);
    expect(isBlockedForAgents('/api/%61gent-access')).toBe(true);
    expect(isBlockedForAgents('/API/Agent-Access')).toBe(true);
    expect(isBlockedForAgents('/api/agent-access/anything')).toBe(true);
  });

  it('keeps agents away from skill scopes, skill bodies and agent profiles', () => {
    expect(isBlockedForAgents('/api/skill-scopes')).toBe(true);
    expect(isBlockedForAgents('/api/skill-library/import', 'POST')).toBe(true);
    expect(isBlockedForAgents('/api/skills/web-prototype')).toBe(true);
    expect(isBlockedForAgents('/api/skills/web-prototype/files')).toBe(true);
    expect(isBlockedForAgents('/api/skills/install', 'POST')).toBe(true);
    expect(isBlockedForAgents('/api/agent-profiles/a1', 'PUT')).toBe(true);
    expect(isBlockedForAgents('/api/mcp-scopes', 'PUT')).toBe(true);
    expect(isBlockedForAgents('/api/mcp/servers')).toBe(true);
    expect(isBlockedForAgents('/api/mcp/servers', 'PUT')).toBe(true);
    expect(isBlockedForAgents('/api/skills')).toBe(false);
    expect(isBlockedForAgents('/api/skills/')).toBe(false);
    expect(isBlockedForAgents('/api/agent-profiles')).toBe(false);
  });

  it('lets everything else through', () => {
    expect(isBlockedForAgents('/api/mac/act')).toBe(false);
    expect(isBlockedForAgents('/api/projects/p1/files')).toBe(false);
    expect(isBlockedForAgents('/api/agent-accessories')).toBe(false);
  });
});

describe('agent gateway', () => {
  let upstream: http.Server;
  let gateway: AgentGateway;

  beforeAll(async () => {
    upstream = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(`upstream ${req.method} ${req.url}`);
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', () => resolve()));
    const address = upstream.address();
    gateway = await startAgentGateway({ host: '127.0.0.1', port: typeof address === 'object' && address ? address.port : 0 });
  });

  afterAll(async () => {
    await gateway.close();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  it('forwards ordinary calls to the daemon', async () => {
    const resp = await fetch(`${gateway.url}/api/health`);
    expect(await resp.text()).toBe('upstream GET /api/health');
  });

  it('answers 403 to an agent trying to change its own access', async () => {
    const resp = await fetch(`${gateway.url}/api/agent-access`, { method: 'PUT', body: '{"readWholeMac":true}' });
    expect(resp.status).toBe(403);
    expect(((await resp.json()) as { error: { code: string } }).error.code).toBe('AGENT_ACCESS_FORBIDDEN');
  });
});
