/**
 * Which skills every agent may use. Three scopes:
 *   - global: listed here; every agent and the default assistant see them;
 *   - an agent's own: its profile's `skillIds`; only that agent sees them;
 *   - the project's active skill: unchanged, shared by whoever works there.
 * A skill in none of these is in the library only: no agent sees it until it
 * is made global, given to an agent, or picked for a message.
 *
 * Kept in the daemon's data root, which agents cannot write, and changed only
 * through an endpoint the agent gateway refuses.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';

export const SKILL_SCOPES_FILE = 'skill-scopes.json';

export interface SkillScopes {
  global: string[];
}

export function normalizeSkillScopes(raw: unknown): SkillScopes {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const global = Array.isArray(record.global)
    ? [...new Set(record.global.filter((id): id is string => typeof id === 'string' && /^[a-z0-9][a-z0-9._-]{0,120}$/i.test(id)))]
    : [];
  return { global };
}

export function createSkillScopesStore(options: { dataDir: string }) {
  const file = path.join(options.dataDir, SKILL_SCOPES_FILE);

  async function read(): Promise<SkillScopes> {
    try {
      return normalizeSkillScopes(JSON.parse(await fsp.readFile(file, 'utf8')));
    } catch {
      return { global: [] };
    }
  }

  async function write(next: SkillScopes): Promise<SkillScopes> {
    const clean = normalizeSkillScopes(next);
    await fsp.mkdir(options.dataDir, { recursive: true });
    await fsp.writeFile(file, `${JSON.stringify(clean, null, 2)}\n`, 'utf8');
    return clean;
  }

  async function setGlobal(id: string, global: boolean): Promise<SkillScopes> {
    const current = await read();
    const ids = new Set(current.global);
    if (global) ids.add(id);
    else ids.delete(id);
    return write({ global: [...ids] });
  }

  return { file, read, write, setGlobal };
}

export type SkillScopesStore = ReturnType<typeof createSkillScopesStore>;
