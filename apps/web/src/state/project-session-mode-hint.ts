import type { ChatSessionMode } from '@open-design/contracts';

/**
 * A per-project hint of the conversation mode, used ONLY to paint the first
 * frame correctly.
 *
 * A project's conversations load asynchronously, and until they do the view
 * has no `sessionMode` to read, so it used to assume Design — which flashed the
 * 3-column design workspace for an Ask (chat) conversation before collapsing
 * it. The hint is written when a project is created and whenever its active
 * conversation's mode is known, and read before the list has arrived. It never
 * decides behavior: the conversation's own `sessionMode` always wins.
 */
const PREFIX = 'open-design.project.sessionModeHint:';

export function rememberProjectSessionMode(projectId: string, mode: ChatSessionMode): void {
  try {
    window.localStorage.setItem(`${PREFIX}${projectId}`, mode);
  } catch {
    // Storage can be unavailable (private mode, hardened contexts): no hint.
  }
}

export function readProjectSessionModeHint(projectId: string): ChatSessionMode | null {
  try {
    const value = window.localStorage.getItem(`${PREFIX}${projectId}`);
    return value === 'design' || value === 'chat' || value === 'plan' ? value : null;
  } catch {
    return null;
  }
}
