/**
 * Skills the person installed straight into their CLIs, found so the app can
 * import them once and give them to every agent (or to one), instead of
 * installing the same skill in each CLI. Read-only: nothing here changes the
 * CLIs' own folders.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';

export interface DiscoveredSkill {
  /** Which CLI folder it was found in. */
  source: string;
  name: string;
  description: string;
  /** The skill's folder (holds SKILL.md and its side files). */
  path: string;
  bytes: number;
}

/** Where CLIs keep the skills a person installs, in the open SKILL.md format. */
export function cliSkillRoots(home: string): Array<{ source: string; dir: string }> {
  return [
    { source: 'antigravity', dir: path.join(home, '.gemini', 'config', 'skills') },
    { source: 'antigravity', dir: path.join(home, '.gemini', 'antigravity-cli', 'skills') },
    { source: 'gemini', dir: path.join(home, '.gemini', 'skills') },
    { source: 'agents', dir: path.join(home, '.agents', 'skills') },
    { source: 'claude', dir: path.join(home, '.claude', 'skills') },
    { source: 'codex', dir: path.join(home, '.codex', 'skills') },
    { source: 'cursor', dir: path.join(home, '.cursor', 'skills') },
  ];
}

/** `name` and `description` from a SKILL.md's YAML front matter (the simple, one-line form). */
export function readFrontMatter(text: string): { name: string | null; description: string | null } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return { name: null, description: null };
  const field = (key: string) => {
    const line = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(match[1]!)?.[1]?.trim();
    if (!line) return null;
    return line.replace(/^(['"])(.*)\1$/, '$2').trim() || null;
  };
  return { name: field('name'), description: field('description') };
}

export async function discoverCliSkills(home: string): Promise<DiscoveredSkill[]> {
  const found: DiscoveredSkill[] = [];
  const seen = new Set<string>();
  for (const root of cliSkillRoots(home)) {
    let entries: string[] = [];
    try {
      entries = await fsp.readdir(root.dir);
    } catch {
      continue;
    }
    for (const entry of entries.sort()) {
      const dir = path.join(root.dir, entry);
      const file = path.join(dir, 'SKILL.md');
      let text: string;
      try {
        text = await fsp.readFile(file, 'utf8');
      } catch {
        continue;
      }
      const real = await fsp.realpath(dir).catch(() => dir);
      if (seen.has(real)) continue;
      seen.add(real);
      const meta = readFrontMatter(text);
      found.push({
        source: root.source,
        name: meta.name ?? entry,
        description: meta.description ?? '',
        path: dir,
        bytes: Buffer.byteLength(text),
      });
    }
  }
  return found;
}

/** Whether `dir` is a skill folder inside one of the CLI roots (imports accept nothing else). */
export function isDiscoverableSkillDir(dir: string, home: string): boolean {
  const resolved = path.resolve(dir);
  return cliSkillRoots(home).some((root) => path.dirname(resolved) === path.resolve(root.dir));
}
