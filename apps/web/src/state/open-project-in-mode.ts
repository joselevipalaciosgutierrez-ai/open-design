import type { ChatSessionMode } from '@open-design/contracts';
import { navigate } from '../router';

/**
 * Enter a project straight in Ask (`chat`) or Design mode, on its most recent
 * conversation, without going through Lev. The conversation keeps the mode.
 */
export async function openProjectInMode(projectId: string, mode: Extract<ChatSessionMode, 'chat' | 'design'>): Promise<void> {
  const base = `/api/projects/${encodeURIComponent(projectId)}/conversations`;
  let conversationId: string | null = null;
  try {
    const resp = await fetch(base);
    if (resp.ok) {
      const { conversations } = (await resp.json()) as { conversations?: Array<{ id: string; updatedAt?: number }> };
      const latest = [...(conversations ?? [])].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
      conversationId = latest?.id ?? null;
    }
    if (conversationId) {
      await fetch(`${base}/${encodeURIComponent(conversationId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionMode: mode }),
      });
    }
  } catch {
    // Open the project anyway; it shows its own last conversation.
  }
  navigate({ kind: 'project', projectId, conversationId, fileName: null });
}
