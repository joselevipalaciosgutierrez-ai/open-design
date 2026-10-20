import type { AgentProfile } from '@open-design/contracts';

/**
 * Apply an agent profile to the body of a run request, in place.
 *
 * A conversation that was opened with an agent profile belongs to that agent:
 * every run in it uses the profile's runtime, model, skills, design system and
 * role instructions, whatever the caller sent. Doing it here, where the run is
 * created, covers every client the same way — the web chat and `od run start`
 * alike — and happens before the run records its agent, so the run, its stored
 * task and the request stay consistent.
 *
 * Fields the profile leaves unset are left as the caller sent them, with one
 * exception: model, reasoning and service tier belong to a specific runtime, so
 * they are dropped when the profile switches the run to a different one.
 */
export function applyAgentProfileToRunBody(
  body: Record<string, unknown>,
  profile: AgentProfile,
): void {
  const sameRuntime = body.agentId === profile.runtimeId;
  body.agentId = profile.runtimeId;

  if (profile.model) {
    body.model = profile.model;
  } else if (!sameRuntime) {
    body.model = null;
  }
  if (!sameRuntime) {
    body.reasoning = null;
    body.serviceTier = null;
  }

  // The agent's own skills are private to it: they travel apart from the
  // skills picked for this message, and the daemon lists them in a short index
  // and stages copies only this run can read (see agent-access/run-skills.ts),
  // instead of pasting their bodies into every turn.
  body.agentSkillIds = [...new Set(profile.skillIds)];

  if (profile.designSystemId) body.designSystemId = profile.designSystemId;

  const instructions = profile.instructions?.trim();
  if (instructions) {
    const role = `## Agent role: ${profile.name}\n\n${instructions}`;
    const existing = typeof body.systemPrompt === 'string' ? body.systemPrompt.trim() : '';
    body.systemPrompt = existing ? `${role}\n\n${existing}` : role;
  }
}
