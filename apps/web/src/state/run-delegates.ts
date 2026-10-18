import { useCallback, useEffect, useRef, useState } from 'react';
import type { RunDelegate, RunDelegatesResponse } from '@open-design/contracts';

const TERMINAL = new Set(['succeeded', 'failed', 'canceled']);
const BATCH_WINDOW_MS = 40;
const POLL_MS = 2500;

interface Pending {
  projectId: string;
  runIds: Set<string>;
  waiters: Map<string, Array<(delegates: RunDelegate[]) => void>>;
}

const cache = new Map<string, RunDelegate[]>();
const pending = new Map<string, Pending>();

function flush(projectId: string): void {
  const batch = pending.get(projectId);
  pending.delete(projectId);
  if (!batch) return;
  const ids = Array.from(batch.runIds);
  const settle = (byParent: Record<string, RunDelegate[]>) => {
    for (const id of ids) {
      const list = byParent[id] ?? [];
      cache.set(id, list);
      for (const resolve of batch.waiters.get(id) ?? []) resolve(list);
    }
  };
  fetch(
    `/api/projects/${encodeURIComponent(projectId)}/run-delegates?parentRunIds=${ids
      .map(encodeURIComponent)
      .join(',')}`,
  )
    .then(async (resp) => (resp.ok ? ((await resp.json()) as RunDelegatesResponse).delegates : {}))
    .catch(() => ({}) as Record<string, RunDelegate[]>)
    .then(settle);
}

/**
 * What the run started, asked for in one request per project per short window:
 * a conversation of fifty turns costs one call, not fifty.
 */
export function requestRunDelegates(projectId: string, runId: string): Promise<RunDelegate[]> {
  let batch = pending.get(projectId);
  if (!batch) {
    batch = { projectId, runIds: new Set(), waiters: new Map() };
    pending.set(projectId, batch);
    setTimeout(() => flush(projectId), BATCH_WINDOW_MS);
  }
  batch.runIds.add(runId);
  return new Promise((resolve) => {
    const list = batch.waiters.get(runId) ?? [];
    list.push(resolve);
    batch.waiters.set(runId, list);
  });
}

/** Test seam: forget everything fetched so far. */
export function resetRunDelegatesCache(): void {
  cache.clear();
  pending.clear();
}

/**
 * The runs an orchestrator started from `runId`. Fetched once, and polled while
 * the turn is live or any delegate is still running, so a card turns from
 * "working" to "done" without a reload.
 */
export function useRunDelegates(
  projectId: string | null | undefined,
  runId: string | null | undefined,
  live: boolean,
): RunDelegate[] {
  const [delegates, setDelegates] = useState<RunDelegate[]>(() => (runId ? cache.get(runId) ?? [] : []));
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!projectId || !runId) return;
    const next = await requestRunDelegates(projectId, runId);
    if (mounted.current) setDelegates(next);
  }, [projectId, runId]);

  const anyRunning = delegates.some((d) => !TERMINAL.has(d.status));
  const needsPolling = live || anyRunning;

  useEffect(() => {
    if (!projectId || !runId) return;
    // A finished turn whose delegates are all finished is settled: use the cache.
    const cached = cache.get(runId);
    if (cached && !live && !cached.some((d) => !TERMINAL.has(d.status))) {
      setDelegates(cached);
      return;
    }
    void load();
  }, [projectId, runId, live, load]);

  useEffect(() => {
    if (!needsPolling || !projectId || !runId) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [needsPolling, projectId, runId, load]);

  return delegates;
}
