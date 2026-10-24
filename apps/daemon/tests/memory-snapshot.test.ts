import { describe, expect, it } from 'vitest';

import { memoryEvents } from '../src/memory.js';
import { createMemorySnapshotStore, memorySnapshots } from '../src/memory-snapshot.js';

describe('memory snapshot store', () => {
  it('serves the same body for a conversation until the user edits memory', async () => {
    const store = createMemorySnapshotStore();
    let calls = 0;
    const load = async () => `body-${++calls}`;

    expect(await store.get('c1', load)).toBe('body-1');
    expect(await store.get('c1', load)).toBe('body-1');
    expect(calls).toBe(1);

    store.invalidateAll();
    expect(await store.get('c1', load)).toBe('body-2');
  });

  it('keeps conversations independent', async () => {
    const store = createMemorySnapshotStore();
    let calls = 0;
    const load = async () => `body-${++calls}`;
    expect(await store.get('a', load)).toBe('body-1');
    expect(await store.get('b', load)).toBe('body-2');
    expect(await store.get('a', load)).toBe('body-1');
  });

  it('never freezes a run with no conversation id', async () => {
    const store = createMemorySnapshotStore();
    let calls = 0;
    const load = async () => `body-${++calls}`;
    expect(await store.get(null, load)).toBe('body-1');
    expect(await store.get(null, load)).toBe('body-2');
  });

  it('evicts the least recently used conversation past its bound', async () => {
    const store = createMemorySnapshotStore(2);
    let calls = 0;
    const load = async () => `body-${++calls}`;
    await store.get('a', load);
    await store.get('b', load);
    await store.get('a', load);
    await store.get('c', load);
    expect(calls).toBe(3);
    await store.get('a', load);
    expect(calls).toBe(3);
    await store.get('b', load);
    expect(calls).toBe(4);
  });

  it('ignores auto-extraction writes but reacts to user edits', async () => {
    let calls = 0;
    const load = async () => `body-${++calls}`;
    await memorySnapshots.get('wired', load);

    memoryEvents.emit('change', { kind: 'upsert', source: 'llm', at: Date.now() });
    memoryEvents.emit('change', { kind: 'upsert', source: 'heuristic', at: Date.now() });
    // The extractor announces a finished batch as one `extract` event.
    memoryEvents.emit('change', { kind: 'extract', source: 'heuristic', count: 2, at: Date.now() });
    memoryEvents.emit('change', { kind: 'extract', source: 'llm', count: 1, at: Date.now() });
    await memorySnapshots.get('wired', load);
    expect(calls).toBe(1);

    memoryEvents.emit('change', { kind: 'upsert', source: 'manual', at: Date.now() });
    await memorySnapshots.get('wired', load);
    expect(calls).toBe(2);

    memoryEvents.emit('change', { kind: 'index', at: Date.now() });
    await memorySnapshots.get('wired', load);
    expect(calls).toBe(3);
  });
});
