/**
 * The daemon as an agent sees it. Agents run inside a sandbox that cannot reach
 * the daemon's own port; this gateway, on a port of its own, forwards every
 * request to the daemon except the ones that would let an agent widen its own
 * access. It is the only way in for an agent, so the rule cannot be skipped by
 * calling the API directly.
 */
import http from 'node:http';

/** Paths an agent may not call, whatever the method. */
export const AGENT_BLOCKED_PATHS = ['/api/agent-access', '/api/skill-scopes', '/api/skill-library', '/api/mcp-scopes', '/api/mcp'];

/**
 * Whether an agent may make this call. Besides the paths above, an agent may
 * not change skills or agent profiles (it would hand itself another agent's
 * skills), and may not read any skill's body or files through the API: it
 * reads the copies the daemon stages for its own run, which the sandbox keeps
 * to its own scope. The list of skills (names, no bodies) stays readable.
 * The MCP settings (`/api/mcp/*`) are closed both ways: they hold other
 * agents' servers and their credentials.
 */
export function isBlockedForAgents(url: string | undefined, method = 'GET'): boolean {
  const pathname = (url ?? '/').split('?')[0]!.replace(/\/{2,}/g, '/');
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return true;
  }
  const lower = decoded.toLowerCase().replace(/\/+$/, '') || '/';
  const under = (prefix: string) => lower === prefix || lower.startsWith(`${prefix}/`);
  if (AGENT_BLOCKED_PATHS.some(under)) return true;
  const reading = method.toUpperCase() === 'GET' || method.toUpperCase() === 'HEAD';
  if (under('/api/skills')) return !reading || lower !== '/api/skills';
  if (under('/api/agent-profiles')) return !reading;
  return false;
}

export interface AgentGateway {
  url: string;
  port: number;
  close: () => Promise<void>;
}

export function startAgentGateway(target: { host: string; port: number }): Promise<AgentGateway> {
  const server = http.createServer((req, res) => {
    if (isBlockedForAgents(req.url, req.method)) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            code: 'AGENT_ACCESS_FORBIDDEN',
            message: 'Agents cannot change what agents may access or read other skills through the API. Use the skills listed for you; ask the person for anything else.',
          },
        }),
      );
      return;
    }
    const upstream = http.request(
      { host: target.host, port: target.port, method: req.method, path: req.url, headers: req.headers },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'DAEMON_UNREACHABLE', message: 'The daemon did not answer.' } }));
    });
    req.pipe(upstream);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}
