/**
 * The skills one run may use: the global ones and, for a run that belongs to
 * an agent, that agent's own. The ones listed for this turn are copied into
 * the run's private folder, the only skill copies its sandbox can read (see
 * `lockedDirs` in sandbox-profile.ts), and described in a short index.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { renderSkillIndex, selectSkillsForTurn, type IndexableSkill } from './skill-index.js';

export interface LibrarySkill {
  id: string;
  name: string;
  description: string;
  triggers?: unknown[];
  dir: string;
}

export interface RunSkillsInput {
  globalIds: readonly string[];
  /** The run's agent profile skills; empty for the default assistant. */
  agentIds: readonly string[];
  /** Skills already active for this turn (the project's, @-mentions): not indexed twice. */
  activeIds: readonly string[];
  library: readonly LibrarySkill[];
  message: string;
  runDir: string;
  copy?: (from: string, to: string) => Promise<void>;
}

export interface RunSkills {
  indexPrompt: string;
  /** Where this run's skill copies live (reopened by the sandbox). */
  skillsDir: string;
  listedIds: string[];
}

export async function prepareRunSkills(input: RunSkillsInput): Promise<RunSkills> {
  const skillsDir = path.join(input.runDir, 'skills');
  const byId = new Map(input.library.map((skill) => [skill.id, skill]));
  const active = new Set(input.activeIds);
  const candidates: Array<IndexableSkill & { dir: string }> = [];
  const add = (id: string, scope: IndexableSkill['scope']) => {
    const skill = byId.get(id);
    if (!skill || active.has(id) || candidates.some((c) => c.id === id)) return;
    candidates.push({ id, name: skill.name, description: skill.description, triggers: skill.triggers ?? [], scope, dir: skill.dir });
  };
  for (const id of input.globalIds) add(id, 'global');
  for (const id of input.agentIds) add(id, 'agent');

  const { listed, unlistedAgentSkills } = selectSkillsForTurn(candidates, input.message);
  const copy = input.copy ?? ((from, to) => fsp.cp(from, to, { recursive: true, dereference: true }));
  await fsp.rm(skillsDir, { recursive: true, force: true });
  const entries: Array<IndexableSkill & { path: string }> = [];
  for (const skill of listed) {
    const source = candidates.find((c) => c.id === skill.id)!.dir;
    const target = path.join(skillsDir, skill.id);
    try {
      await fsp.mkdir(skillsDir, { recursive: true });
      await copy(source, target);
      entries.push({ ...skill, path: path.join(target, 'SKILL.md') });
    } catch {
      // A skill that cannot be copied is left out rather than pointed at a path the agent cannot read.
    }
  }
  return {
    indexPrompt: renderSkillIndex(entries, unlistedAgentSkills),
    skillsDir,
    listedIds: entries.map((entry) => entry.id),
  };
}
