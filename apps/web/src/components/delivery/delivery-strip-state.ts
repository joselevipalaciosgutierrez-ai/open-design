import type { DeliveryStatusResponse } from '@open-design/contracts';
import { deliveryActionOf, type DeliveryAction } from '../../runtime/chat/status-panel';

export interface DeliveryStripView {
  completed: number;
  total: number;
  /** The stage the strip talks about: the blocked one, else the next one. */
  focus: { name: string; status: 'pending' | 'running' | 'done' | 'blocked' } | null;
  /** Everything before publishing is done. */
  readyToPublish: boolean;
  blocked: boolean;
  action: DeliveryAction | null;
  stages: DeliveryStatusResponse['stages'];
}

/**
 * What the delivery strip shows, from the delivery and whether a run is going.
 * Null when there is nothing to show (no delivery, or no stages).
 */
export function deliveryStripView(
  delivery: DeliveryStatusResponse | null | undefined,
  runActive: boolean,
): DeliveryStripView | null {
  if (!delivery || !delivery.present || delivery.stages.length === 0) return null;
  const blockedStage = delivery.stages.find((stage) => stage.status === 'blocked') ?? null;
  const focusStage = blockedStage ?? delivery.next;
  const action = deliveryActionOf(delivery, runActive);
  return {
    completed: delivery.completed,
    total: delivery.total,
    focus: focusStage ? { name: focusStage.name, status: focusStage.status } : null,
    readyToPublish: action?.kind === 'publish' || (focusStage?.id === 'publish' && delivery.stages.every((s) => s.id === 'publish' || s.status === 'done')),
    blocked: blockedStage !== null,
    action,
    stages: delivery.stages,
  };
}
