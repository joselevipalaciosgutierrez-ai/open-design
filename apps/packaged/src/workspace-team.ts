/**
 * Workspace Team transports are disabled as Vela/cloud is removed.
 */
export function workspaceTeamTransportEnv(
  _amrProfile?: string | null | undefined,
  _velaWebUrl?: string | null | undefined,
): Record<string, string> {
  return {};
}
