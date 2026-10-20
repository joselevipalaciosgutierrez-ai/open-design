/**
 * The agents' access settings, kept in the daemon's data root. The file sits
 * outside every folder an agent may write, and the endpoint that changes it is
 * not reachable from inside an agent's sandbox (see `agent-gateway.ts`), so an
 * agent cannot grant itself more.
 */
import { promises as fsp, statSync } from 'node:fs';
import path from 'node:path';

import { DEFAULT_AGENT_ACCESS, type AgentAccessSettings } from '@open-design/contracts';

export const AGENT_ACCESS_FILE = 'agent-access.json';

/** Folders that may never be handed to an agent to write in, nor anything inside them. */
const SYSTEM_ROOTS = ['/System', '/Library', '/usr', '/bin', '/sbin', '/etc', '/private/etc', '/var', '/private/var', '/Applications', '/opt', '/cores', '/dev', '/Volumes'];

export interface RefusedDir {
  path: string;
  reason: string;
}

/**
 * Whether a folder may be allowed for writing, and why not. The whole disk,
 * the home folder itself and system folders are refused: allowing them would
 * undo the point of the sandbox.
 */
export function checkAllowedDir(dir: string, home: string, exists: (p: string) => boolean = isDirectory): string | null {
  if (!path.isAbsolute(dir)) return 'not an absolute path';
  const clean = path.resolve(dir);
  if (clean === '/') return 'the whole disk';
  if (clean === path.resolve(home)) return 'the whole home folder';
  if (SYSTEM_ROOTS.some((root) => clean === root || clean.startsWith(`${root}/`))) return 'a system folder';
  if (clean.startsWith(`${path.resolve(home)}/Library`)) return 'a system folder';
  if (!exists(clean)) return 'not an existing folder';
  return null;
}

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function normalizeAgentAccess(
  raw: unknown,
  home: string,
  exists?: (p: string) => boolean,
): { access: AgentAccessSettings; refused: RefusedDir[] } {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const refused: RefusedDir[] = [];
  const dirs: string[] = [];
  for (const entry of Array.isArray(record.allowedDirs) ? record.allowedDirs : []) {
    if (typeof entry !== 'string' || !entry.trim()) continue;
    const reason = checkAllowedDir(entry.trim(), home, exists);
    if (reason) {
      refused.push({ path: entry, reason });
      continue;
    }
    const clean = path.resolve(entry.trim());
    if (!dirs.includes(clean)) dirs.push(clean);
  }
  return {
    access: {
      allowedDirs: dirs,
      readWholeMac: typeof record.readWholeMac === 'boolean' ? record.readWholeMac : DEFAULT_AGENT_ACCESS.readWholeMac,
      macControl: typeof record.macControl === 'boolean' ? record.macControl : DEFAULT_AGENT_ACCESS.macControl,
    },
    refused,
  };
}

export function createAgentAccessStore(options: { dataDir: string; home: string }) {
  const file = path.join(options.dataDir, AGENT_ACCESS_FILE);

  async function read(): Promise<AgentAccessSettings> {
    try {
      const raw = JSON.parse(await fsp.readFile(file, 'utf8')) as unknown;
      return normalizeAgentAccess(raw, options.home).access;
    } catch {
      return { ...DEFAULT_AGENT_ACCESS, allowedDirs: [] };
    }
  }

  async function update(patch: Partial<AgentAccessSettings>): Promise<{ access: AgentAccessSettings; refused: RefusedDir[] }> {
    const current = await read();
    const next = normalizeAgentAccess({ ...current, ...patch }, options.home);
    await fsp.mkdir(options.dataDir, { recursive: true });
    await fsp.writeFile(file, `${JSON.stringify(next.access, null, 2)}\n`, 'utf8');
    return next;
  }

  return { file, read, update };
}

export type AgentAccessStore = ReturnType<typeof createAgentAccessStore>;
