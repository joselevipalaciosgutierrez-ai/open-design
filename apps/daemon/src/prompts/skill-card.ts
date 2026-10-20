/**
 * The active skill in an Ask (chat) conversation, as a card instead of its
 * whole body. Ask mode is mostly talk; a skill's full workflow (some are
 * ~20k tokens) was pasted into every message, "hola" included. The card says
 * which skill is active and where its SKILL.md is, so the agent reads it the
 * moment it starts real work with it — the way the design system's pull
 * layer already works.
 *
 * Returns null when the body carries no skill root to point at (skills with
 * no side files are short): the caller then keeps the full body.
 */
export function askModeSkillCard(skillName: string | undefined, skillBody: string): string | null {
  const relative = /\*\*Skill root \(relative to project\):\*\*\s*`([^`]+)`/.exec(skillBody)?.[1];
  const absolute = /\*\*Skill root \(absolute fallback\):\*\*\s*`([^`]+)`/.exec(skillBody)?.[1];
  if (!relative && !absolute) return null;
  const root = (relative ?? absolute)!.replace(/\/+$/, '');
  const fallback = absolute && relative ? ` (or \`${absolute.replace(/\/+$/, '')}/SKILL.md\` if that path is not reachable)` : '';
  return [
    `\n\n## Active skill${skillName ? ` — ${skillName}` : ''} (on demand)`,
    '',
    `This conversation is in Ask mode, so the skill's workflow is not loaded here. For a question or a conversation you do not need it. Before you design or build anything it covers — or brief an agent to — read \`${root}/SKILL.md\`${fallback} and follow its workflow exactly, including the side files it tells you to read first.`,
  ].join('\n');
}
