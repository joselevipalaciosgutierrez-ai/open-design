/**
 * Lev's own space: the orchestrator is not a project, but it keeps its
 * sessions (conversations) in a hidden system project, so it reuses the chat,
 * resume, token meter and voice that projects already have.
 *   GET /api/orchestrator                → OrchestratorWorkspaceResponse (created on first use)
 *   GET /api/orchestrator/orders?runId=  → OrchestratorOrdersResponse
 */
export const ORCHESTRATOR_SYSTEM_TAG = 'orchestrator' as const;

export interface OrchestratorWorkspaceResponse {
  /** The hidden system project that holds Lev's sessions. */
  projectId: string;
  /** Lev's sessions that have messages, newest first. */
  sessions: Array<{
    id: string;
    /** The title the agent gave the session, when it has one. */
    title: string | null;
    /** The first thing the person said, as a fallback name (trimmed). */
    preview: string | null;
    messageCount: number;
    updatedAt: number;
  }>;
}

/** Whether a project is a system project the app keeps out of project lists. */
export function isSystemProject(project: { metadata?: unknown } | null | undefined): boolean {
  const metadata = project?.metadata as { system?: unknown } | null | undefined;
  return typeof metadata?.system === 'string' && metadata.system.length > 0;
}

/** One piece of work Lev handed to a project during a turn. */
export interface OrchestratorOrder {
  runId: string;
  projectId: string;
  projectName: string | null;
  conversationId: string | null;
  conversationTitle: string | null;
  agentId: string | null;
  status: string;
  createdAt: number;
  terminalAt: number | null;
}

export interface OrchestratorOrdersResponse {
  orders: OrchestratorOrder[];
}
