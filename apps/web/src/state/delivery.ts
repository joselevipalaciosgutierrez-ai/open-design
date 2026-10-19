import { useEffect, useState } from 'react';
import type { DeliveryStatusResponse } from '@open-design/contracts';

/**
 * The staged-delivery state of a project (`DELIVERY.json`), read through the same
 * endpoint as `od delivery status`. Never throws: a failed read is "no delivery",
 * so the panel falls back to its ordinary tasks.
 */
export async function fetchProjectDelivery(projectId: string): Promise<DeliveryStatusResponse | null> {
  try {
    const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/delivery`);
    if (!resp.ok) return null;
    const body = (await resp.json()) as Partial<DeliveryStatusResponse> | null;
    if (!body || typeof body !== 'object' || body.present !== true || !Array.isArray(body.stages)) {
      return null;
    }
    return body as DeliveryStatusResponse;
  } catch {
    return null;
  }
}

/** How often the delivery is re-read while an agent is working on it. */
export const DELIVERY_POLL_MS = 4000;

/**
 * Reads the delivery when the project or the conversation changes, and keeps
 * re-reading while `polling` (a run is going), once more when it stops so the
 * final state lands.
 */
export function useProjectDelivery(
  projectId: string | null | undefined,
  polling: boolean,
  refreshKey?: string | null,
): DeliveryStatusResponse | null {
  const [delivery, setDelivery] = useState<DeliveryStatusResponse | null>(null);

  useEffect(() => {
    if (!projectId) {
      setDelivery(null);
      return undefined;
    }
    let cancelled = false;
    const read = () => {
      void fetchProjectDelivery(projectId).then((next) => {
        if (!cancelled) setDelivery(next);
      });
    };
    read();
    if (!polling) return () => { cancelled = true; };
    const timer = setInterval(read, DELIVERY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [projectId, polling, refreshKey]);

  return delivery;
}
