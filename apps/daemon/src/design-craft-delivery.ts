/**
 * Where the design rulebook lives. `pull` (default) keeps a short digest in the
 * charter and lists the `design-craft` skill as a global skill, so the agent
 * reads the full text only when it designs; `OD_DESIGN_CRAFT=inline` restores
 * the whole rulebook in the prompt. Runs without file tools (BYOK) always keep
 * it inline — see `renderSlimCoreCharter`.
 */
export const DESIGN_CRAFT_DELIVERY: 'inline' | 'pull' =
  process.env.OD_DESIGN_CRAFT === 'inline' ? 'inline' : 'pull';

export const DESIGN_CRAFT_SKILL_ID = 'design-craft';

/**
 * `pull` only while the skill can actually be read: a person who deletes it
 * from their library gets the full rulebook back in the prompt instead of a
 * digest that points at nothing.
 */
export function effectiveDesignCraftDelivery(
  skills: ReadonlyArray<{ id: string }>,
  configured: 'inline' | 'pull' = DESIGN_CRAFT_DELIVERY,
): 'inline' | 'pull' {
  return configured === 'pull' && skills.some((skill) => skill.id === DESIGN_CRAFT_SKILL_ID)
    ? 'pull'
    : 'inline';
}
