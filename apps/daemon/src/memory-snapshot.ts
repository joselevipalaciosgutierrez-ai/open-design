import { memoryEvents } from './memory.js';

/**
 * Memory text is part of the stable prompt prefix. The auto-extractor writes
 * new facts while a conversation is running, so recomputing it every run moves
 * the prefix mid-session and re-sends everything behind it (history included).
 *
 * A conversation therefore keeps the memory text it first saw. It is dropped
 * only when the person changes memory themselves (manual edit, index or config
 * change, delete): those must show up on the very next run. Facts the
 * extractor adds reach the conversation's next sibling instead.
 */

const AUTO_EXTRACTED = new Set(['heuristic', 'llm']);

export interface MemorySnapshotStore {
  /** Memory text for the conversation; `load` runs only when none is frozen. */
  get(conversationId: string | null | undefined, load: () => Promise<string>): Promise<string>;
  invalidateAll(): void;
}

export function createMemorySnapshotStore(maxConversations = 200): MemorySnapshotStore {
  // Insertion order doubles as recency: a hit re-inserts its key.
  const frozen = new Map<string, string>();
  return {
    async get(conversationId, load) {
      if (!conversationId) return load();
      const hit = frozen.get(conversationId);
      if (hit !== undefined) {
        frozen.delete(conversationId);
        frozen.set(conversationId, hit);
        return hit;
      }
      const body = await load();
      frozen.set(conversationId, body);
      while (frozen.size > maxConversations) {
        const oldest = frozen.keys().next().value;
        if (oldest === undefined) break;
        frozen.delete(oldest);
      }
      return body;
    },
    invalidateAll() {
      frozen.clear();
    },
  };
}

export const memorySnapshots = createMemorySnapshotStore();

memoryEvents.on('change', (event: { kind?: string; source?: string }) => {
  // Single writes (`upsert`) and finished batches (`extract`) both carry the
  // extractor's source; a person's edit never does.
  if (event.source && AUTO_EXTRACTED.has(event.source)) return;
  memorySnapshots.invalidateAll();
});
