/**
 * The skills an agent is told about on one turn, as a short index instead of
 * their bodies. Each entry is a name, one line on when to use it, and the path
 * to its SKILL.md; the agent reads the file only when the task needs it.
 *
 * Global skills are always listed (they are few and apply everywhere). An
 * agent's own skills are listed all when there are only a few; otherwise only
 * those whose name, description or triggers share words with this message.
 * The matching is local and free: no model call, no tokens.
 */

export interface IndexableSkill {
  id: string;
  name: string;
  description: string;
  triggers?: unknown[];
  scope: 'global' | 'agent';
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'are', 'use', 'when', 'into', 'what', 'how',
  'los', 'las', 'del', 'una', 'uno', 'con', 'por', 'para', 'que', 'como', 'esta', 'este', 'esto', 'mas', 'muy',
  'pero', 'sin', 'sus', 'hay', 'haz', 'hacer', 'quiero', 'puedes', 'algo', 'todo', 'cuando',
]);

/** Lower-cased, accent-free words of three letters or more, minus filler. */
export function contentWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return new Set(words);
}

/** How much a skill has to do with a message: shared words, the name counting double. */
export function skillRelevance(skill: IndexableSkill, message: string): number {
  const said = contentWords(message);
  if (said.size === 0) return 0;
  const nameWords = contentWords(`${skill.id} ${skill.name}`);
  const otherWords = contentWords(
    `${skill.description} ${(skill.triggers ?? []).filter((t): t is string => typeof t === 'string').join(' ')}`,
  );
  let score = 0;
  for (const word of said) {
    if (nameWords.has(word)) score += 2;
    else if (otherWords.has(word)) score += 1;
  }
  return score;
}

export function selectSkillsForTurn(
  skills: readonly IndexableSkill[],
  message: string,
  options: { agentListAllUpTo?: number; agentLimit?: number; globalLimit?: number } = {},
): { listed: IndexableSkill[]; unlistedAgentSkills: number } {
  const listAllUpTo = options.agentListAllUpTo ?? 4;
  const agentLimit = options.agentLimit ?? 5;
  const globals = skills.filter((s) => s.scope === 'global').slice(0, options.globalLimit ?? 8);
  const own = skills.filter((s) => s.scope === 'agent' && !globals.some((g) => g.id === s.id));
  let ownListed: IndexableSkill[];
  if (own.length <= listAllUpTo) {
    ownListed = own;
  } else {
    ownListed = own
      .map((skill) => ({ skill, score: skillRelevance(skill, message) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, agentLimit)
      .map((entry) => entry.skill);
  }
  return { listed: [...globals, ...ownListed], unlistedAgentSkills: own.length - ownListed.length };
}

export function renderSkillIndex(
  entries: ReadonlyArray<IndexableSkill & { path: string }>,
  unlistedAgentSkills: number,
): string {
  if (entries.length === 0 && unlistedAgentSkills === 0) return '';
  const lines = [
    '## Skills you can use',
    '',
    'Read a skill\'s SKILL.md only when this task needs it, then follow it. Global skills apply to every agent; "yours" are this agent\'s own and no other agent can read them.',
    '',
  ];
  for (const entry of entries) {
    const description = entry.description.replace(/\s+/g, ' ').trim().slice(0, 200);
    lines.push(`- **${entry.name}** (${entry.scope === 'global' ? 'global' : 'yours'})${description ? ` — ${description}` : ''} \`${entry.path}\``);
  }
  if (unlistedAgentSkills > 0) {
    lines.push(
      '',
      `${unlistedAgentSkills} more of your skills have nothing to do with this message, so they are not listed. If the task turns out to need one, say so.`,
    );
  }
  return lines.join('\n');
}
