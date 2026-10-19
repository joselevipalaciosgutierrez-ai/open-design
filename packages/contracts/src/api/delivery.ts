/**
 * `DELIVERY.json`: the state file of a staged delivery (spec → design → build →
 * verify → review → publish), kept at the project root by the orchestrator.
 *
 * The file is written by a model, so it is read defensively: `parseDeliveryFile`
 * never throws and reports what it could not use. The one rule that keeps it
 * honest is `checkDeliveryUpdate`: after the first write a stage may only change
 * its `status` and gain `notes` (and be handed to another `agent` when the first
 * could not run it); it may not be deleted, reordered or reworded to make it pass.
 *
 * Pure TypeScript on purpose (contracts stay free of Node and Express), so the
 * daemon, the web app and tests share the exact same reading of the file.
 */

export const DELIVERY_FILE_NAME = 'DELIVERY.json';

export const DELIVERY_STAGE_STATUSES = ['pending', 'running', 'done', 'blocked'] as const;
export type DeliveryStageStatus = (typeof DELIVERY_STAGE_STATUSES)[number];

export interface DeliveryStage {
  id: string;
  name: string;
  agent: string | null;
  deliverable: string | null;
  status: DeliveryStageStatus;
  notes: string | null;
}

export interface DeliveryState {
  goal: string;
  stages: DeliveryStage[];
}

export interface DeliveryParseResult {
  state: DeliveryState | null;
  /** Human-readable problems; the state may still be usable when this is non-empty. */
  issues: string[];
}

/** What `GET /api/projects/:id/delivery` returns. */
export interface DeliveryStatusResponse {
  present: boolean;
  goal: string | null;
  stages: DeliveryStage[];
  /** First stage that is not done, or null when every stage is done. */
  next: DeliveryStage | null;
  completed: number;
  total: number;
  /** True once every stage is done. */
  finished: boolean;
  /** True when a stage is blocked: a person has to look. */
  blocked: boolean;
  issues: string[];
  /** Edits that broke the rules since the last time the file was read (see `checkDeliveryUpdate`). */
  violations: string[];
}

const STATUS_SET: ReadonlySet<string> = new Set(DELIVERY_STAGE_STATUSES);

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, max);
}

export function parseDeliveryFile(raw: string | unknown): DeliveryParseResult {
  const issues: string[] = [];
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return { state: null, issues: ['DELIVERY.json is not valid JSON'] };
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { state: null, issues: ['DELIVERY.json must be an object'] };
  }
  const record = value as Record<string, unknown>;
  const rawStages = Array.isArray(record.stages) ? record.stages : null;
  if (!rawStages) {
    return { state: null, issues: ['DELIVERY.json has no "stages" list'] };
  }

  const stages: DeliveryStage[] = [];
  const seen = new Set<string>();
  rawStages.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      issues.push(`stage ${index + 1} is not an object`);
      return;
    }
    const stage = entry as Record<string, unknown>;
    const id = text(stage.id, 64);
    if (!id) {
      issues.push(`stage ${index + 1} has no id`);
      return;
    }
    if (seen.has(id)) {
      issues.push(`stage id "${id}" is repeated`);
      return;
    }
    seen.add(id);
    let status: DeliveryStageStatus = 'pending';
    if (typeof stage.status === 'string' && STATUS_SET.has(stage.status)) {
      status = stage.status as DeliveryStageStatus;
    } else if (stage.status !== undefined) {
      issues.push(`stage "${id}" has an unknown status`);
    }
    stages.push({
      id,
      name: text(stage.name, 200) ?? id,
      agent: text(stage.agent, 80),
      deliverable: text(stage.deliverable, 300),
      status,
      notes: text(stage.notes, 1000),
    });
  });

  if (stages.length === 0) issues.push('DELIVERY.json has no usable stage');
  return {
    state: stages.length === 0 ? null : { goal: text(record.goal, 500) ?? '', stages },
    issues,
  };
}

/**
 * Whether `next` is an allowed edit of `prev`. Stages may not be removed,
 * reordered or renamed, and their deliverable is fixed; `status`, `notes` and
 * `agent` (a reassignment after a delegate failed) move, and stages may be
 * appended.
 */
export function checkDeliveryUpdate(prev: DeliveryState, next: DeliveryState): string[] {
  const problems: string[] = [];
  prev.stages.forEach((before, index) => {
    const after = next.stages[index];
    if (!after || after.id !== before.id) {
      problems.push(`stage "${before.id}" was removed or moved`);
      return;
    }
    if (after.name !== before.name) problems.push(`stage "${before.id}" was renamed`);
    if (after.deliverable !== before.deliverable) {
      problems.push(`stage "${before.id}" changed its deliverable`);
    }
  });
  if (prev.goal && next.goal !== prev.goal) problems.push('the goal was reworded');
  return problems;
}

export function summarizeDelivery(parsed: DeliveryParseResult): DeliveryStatusResponse {
  const state = parsed.state;
  if (!state) {
    return {
      present: false,
      goal: null,
      stages: [],
      next: null,
      completed: 0,
      total: 0,
      finished: false,
      blocked: false,
      issues: parsed.issues,
      violations: [],
    };
  }
  const completed = state.stages.filter((s) => s.status === 'done').length;
  const next = state.stages.find((s) => s.status !== 'done') ?? null;
  return {
    present: true,
    goal: state.goal || null,
    stages: state.stages,
    next,
    completed,
    total: state.stages.length,
    finished: next === null,
    blocked: state.stages.some((s) => s.status === 'blocked'),
    issues: parsed.issues,
    violations: [],
  };
}
