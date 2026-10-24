/**
 * How the design rulebook reaches a run. The full text is the `design-craft` skill, which
 * the Design agent owns (see default-agents.ts), so the runs that do not design never pay
 * for it. What each run's charter carries depends on whether that run has the skill:
 *
 * - `pull`: a short digest of the hard rules plus a pointer to the skill the run owns.
 * - `digest`: the hard rules only, because the run has no skill to point at.
 * - `inline`: the whole rulebook in the prompt. For runs that cannot read files (BYOK),
 *   for a library where the skill no longer exists, and with `OD_DESIGN_CRAFT=inline`.
 */
export type DesignCraftDelivery = 'inline' | 'pull' | 'digest';

export const DESIGN_CRAFT_DELIVERY: 'inline' | 'pull' =
  process.env.OD_DESIGN_CRAFT === 'inline' ? 'inline' : 'pull';

export const DESIGN_CRAFT_SKILL_ID = 'design-craft';

interface OwnsSkills {
  skillIds?: readonly string[];
}

/**
 * Whether this run has `design-craft` among the skills it can read.
 *
 * - A run of an agent has it when the agent owns it (or the person made it global).
 * - The default assistant (`agentSkillIds` null) hands design to the design agent when
 *   there is one, so it does not carry the skill; with no design agent it designs itself,
 *   so it gets the skill rather than losing the rules.
 */
export function designCraftAvailableToRun(input: {
  /** The skills of the agent the run belongs to; null for the default assistant. */
  agentSkillIds: readonly string[] | null;
  globalIds: readonly string[];
  profiles: ReadonlyArray<OwnsSkills>;
}): boolean {
  if (input.globalIds.includes(DESIGN_CRAFT_SKILL_ID)) return true;
  if (input.agentSkillIds !== null) return input.agentSkillIds.includes(DESIGN_CRAFT_SKILL_ID);
  return !input.profiles.some((profile) => profile.skillIds?.includes(DESIGN_CRAFT_SKILL_ID));
}

export function effectiveDesignCraftDelivery(
  skills: ReadonlyArray<{ id: string }>,
  available: boolean,
  configured: 'inline' | 'pull' = DESIGN_CRAFT_DELIVERY,
): DesignCraftDelivery {
  if (configured === 'inline') return 'inline';
  // Nothing to read, or to point at: the rules go back into the prompt.
  if (!skills.some((skill) => skill.id === DESIGN_CRAFT_SKILL_ID)) return 'inline';
  return available ? 'pull' : 'digest';
}
