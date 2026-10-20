/**
 * Lev's general chat on Home: which session is current, and the rules for
 * when a new one starts.
 *
 * - The session lives in memory for this app run: reopening the app starts a
 *   new session (the previous one stays listed and can be resumed).
 * - Leaving Home folds the chat. Writing while it is folded starts a new
 *   session; unfolding it first continues the current one.
 */
import type { OrchestratorWorkspaceResponse } from '@open-design/contracts';

export interface LevSessionState {
  projectId: string | null;
  sessionId: string | null;
}

const state: LevSessionState = { projectId: null, sessionId: null };
const listeners = new Set<() => void>();

export function levSession(): LevSessionState {
  return { ...state };
}

export function subscribeLevSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function set(next: Partial<LevSessionState>): void {
  Object.assign(state, next);
  for (const listener of listeners) listener();
}

export async function fetchLevSpace(): Promise<OrchestratorWorkspaceResponse> {
  const resp = await fetch('/api/orchestrator');
  if (!resp.ok) throw new Error(`Lev is not reachable (${resp.status})`);
  const space = (await resp.json()) as OrchestratorWorkspaceResponse;
  set({ projectId: space.projectId });
  return space;
}

export async function startLevSession(projectId: string): Promise<string> {
  const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/conversations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionMode: 'chat' }),
  });
  if (!resp.ok) throw new Error(`A new session could not be started (${resp.status})`);
  const body = (await resp.json()) as { conversation?: { id?: string }; id?: string };
  const id = body.conversation?.id ?? body.id;
  if (!id) throw new Error('The new session has no id');
  set({ projectId, sessionId: id });
  return id;
}

/** Continue an earlier session (from the resume button or the session list). */
export function resumeLevSession(projectId: string, sessionId: string): void {
  set({ projectId, sessionId });
}

/** Folding while writing starts fresh: the next message opens a new session. */
export function forgetCurrentLevSession(): void {
  set({ sessionId: null });
}

/** Only for tests. */
export function resetLevSessionForTests(): void {
  set({ projectId: null, sessionId: null });
}

/** Delete one of Lev's sessions for good. Deleting the current one starts fresh. */
export async function deleteLevSession(projectId: string, sessionId: string): Promise<void> {
  const resp = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' },
  );
  if (!resp.ok && resp.status !== 404) throw new Error(`The session could not be deleted (${resp.status})`);
  if (state.sessionId === sessionId) set({ sessionId: null });
}
