/**
 * Lev's own space: the orchestrator is not a project, but it keeps its
 * sessions (conversations) in a hidden system project, so it reuses the chat,
 * resume, token meter and voice that projects already have.
 *   GET /api/orchestrator   → OrchestratorWorkspaceResponse (created on first use)
 */
export const ORCHESTRATOR_SYSTEM_TAG = 'orchestrator' as const;

export interface OrchestratorWorkspaceResponse {
  /** The hidden system project that holds Lev's sessions. */
  projectId: string;
  /** Lev's sessions, newest first. */
  sessions: Array<{ id: string; title: string | null; updatedAt: number }>;
}

/** Whether a project is a system project the app keeps out of project lists. */
export function isSystemProject(project: { metadata?: unknown } | null | undefined): boolean {
  const metadata = project?.metadata as { system?: unknown } | null | undefined;
  return typeof metadata?.system === 'string' && metadata.system.length > 0;
}
