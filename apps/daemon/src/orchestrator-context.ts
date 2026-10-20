/**
 * Whether a run is the orchestrator, and what it needs to know if so.
 *
 * The default assistant (no agent selected) becomes the orchestrator once the
 * user has agents. This is decided here, in code, from facts about the run, so
 * the prompt text never has to guess its own situation. The directive itself
 * has one source: `@open-design/contracts` `orchestrator.ts`.
 */
import { isSystemProject, type AgentProfile, type ChatSessionMode, type OrchestratorContext } from '@open-design/contracts';

import { countMessages, getConversation, listAgentProfiles, listConversations, listMessages, listProjects } from './db.js';
import { lastNotebookEntrySync } from './notebook.js';
import { findOrchestratorProjectId } from './routes/orchestrator.js';
import { DEFAULT_DELEGATION_LIMITS, type DelegationLimits } from './delegation.js';

type Db = Parameters<typeof listAgentProfiles>[0];

export interface OrchestratorRunFacts {
  /** The run's delegation position; non-null for a run another run started. */
  delegation?: unknown;
  /** Runs with no conversation (routines, background jobs) are not chats. */
  conversationId?: string | null;
  /** Internal design-system enrichment runs do one fixed job. */
  analyticsHints?: unknown;
  /** The project the run belongs to: Lev's own space makes it the general orchestrator. */
  projectId?: string | null;
}

export interface ResolveOrchestratorInput {
  run: OrchestratorRunFacts;
  /** Agent profile the conversation is bound to, if the user selected one. */
  conversationAgentProfileId: string | null | undefined;
  profiles: ReadonlyArray<AgentProfile>;
  sessionMode?: ChatSessionMode | undefined;
  /** `plain` is API/BYOK: no shell, so nothing to delegate with. */
  streamFormat?: string | null | undefined;
  limits?: DelegationLimits;
  /** The run is in Lev's space (the general chat on Home). */
  inOrchestratorSpace?: boolean;
  /** The person's projects, most recent first; listed for Lev. */
  projects?: ReadonlyArray<{ id: string; name: string; lastNote?: string | null }>;
  /** Lev's earlier sessions, most recent first. */
  recentSessions?: ReadonlyArray<{ id: string; label: string; date: string }>;
}

function isDesignSystemEnrichment(hints: unknown): boolean {
  return (
    hints !== null
    && typeof hints === 'object'
    && !Array.isArray(hints)
    && (hints as Record<string, unknown>).dsEnrichment === true
  );
}

/** The orchestrator context for this run, or null when it is an ordinary run. */
export function resolveOrchestratorContext(input: ResolveOrchestratorInput): OrchestratorContext | null {
  const { run } = input;
  if (input.streamFormat === 'plain') return null;
  // A run another run started is a delegate: it works, it does not coordinate.
  if (run.delegation) return null;
  if (!run.conversationId) return null;
  if (isDesignSystemEnrichment(run.analyticsHints)) return null;
  // The user picked an agent: they are talking to it directly.
  if (input.conversationAgentProfileId) return null;
  // Lev coordinates every project, with or without agents set up.
  if (input.profiles.length === 0 && !input.inOrchestratorSpace) return null;

  const limits = input.limits ?? DEFAULT_DELEGATION_LIMITS;
  return {
    agents: input.profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      emoji: profile.emoji,
      role: profile.role,
      runtimeId: profile.runtimeId,
      model: profile.model,
    })),
    limits: {
      maxDepth: limits.maxDepth,
      maxRunsPerTree: limits.maxRunsPerTree,
      maxConcurrentPerTree: limits.maxConcurrentPerTree,
      maxInstancesPerAgent: limits.maxInstancesPerAgent,
    },
    sessionMode: input.sessionMode,
    ...(input.inOrchestratorSpace
      ? { scope: 'everywhere' as const, projects: input.projects ?? [], recentSessions: input.recentSessions ?? [] }
      : {}),
  };
}

/**
 * `resolveOrchestratorContext` fed from the database. Both prompt builders call
 * this, never the pure function directly: the legacy stack composes in
 * `server.ts` and OD Next composes its initial bundle in
 * `strategies/od-next/initial-prompt-bundle-service.ts`, and a rule decided in
 * two places would drift (the OD Next half is exactly what an end-to-end test
 * caught missing).
 */
export function resolveOrchestratorForRun(
  db: Db,
  input: {
    run: OrchestratorRunFacts;
    sessionMode?: ChatSessionMode | undefined;
    streamFormat?: string | null | undefined;
    limits?: DelegationLimits;
    /** The daemon's data root: Lev reads each project's latest notebook line. */
    dataDir?: string;
  },
): OrchestratorContext | null {
  const conversationId = input.run.conversationId;
  const levProjectId = findOrchestratorProjectId(db);
  const inOrchestratorSpace = !!levProjectId && input.run.projectId === levProjectId;
  return resolveOrchestratorContext({
    ...input,
    inOrchestratorSpace,
    ...(inOrchestratorSpace
      ? {
          projects: (listProjects(db) as Array<{ id: string; name: string; updatedAt?: number; metadata?: unknown }>)
            .filter((project) => !isSystemProject(project))
            .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
            .map((project) => ({
              id: project.id,
              name: project.name,
              lastNote: input.dataDir ? lastNotebookEntrySync(input.dataDir, project.id) : null,
            })),
          recentSessions: (listConversations(db, levProjectId as string) as Array<{ id: string; title?: string | null; updatedAt?: number; createdAt?: number }>)
            .filter((conversation) => conversation.id !== conversationId && countMessages(db, conversation.id) > 0)
            .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
            .slice(0, 5)
            .map((conversation) => {
              const firstUser = (listMessages(db, conversation.id) as Array<{ role?: string; content?: string }>).find((m) => m.role === 'user');
              const at = new Date(conversation.updatedAt ?? conversation.createdAt ?? 0);
              return {
                id: conversation.id,
                label: (conversation.title || firstUser?.content || '').replace(/\s+/g, ' ').trim().slice(0, 90) || '(untitled)',
                date: `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`,
              };
            }),
        }
      : {}),
    conversationAgentProfileId: conversationId
      ? (getConversation(db, conversationId)?.agentProfileId ?? null)
      : null,
    profiles: listAgentProfiles(db),
  });
}
