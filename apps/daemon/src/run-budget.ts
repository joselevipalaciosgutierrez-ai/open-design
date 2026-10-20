/**
 * The token meter: what a run sent to its agent, by part, and how long each
 * phase took. Written next to the run (`<runDir>/budget.json`) when the prompt
 * is composed, completed with the timings when the agent finishes, and served
 * by `GET /api/runs/:runId/budget` for the chat and `od run budget`.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';

import type { RunPromptBudget, RunPromptBudgetTimings } from '@open-design/contracts';

export const RUN_BUDGET_FILE = 'budget.json';

/**
 * Sections of the stable slice: a resumed session that already holds them is
 * not sent them again, so they are left out of that turn's detail.
 */
const STABLE_SECTION_KINDS = new Set([
  'daemonSystemPrompt',
  'runtimeToolPrompt',
  'skillPrompt',
  'designSystemPrompt',
  'pluginStagePrompt',
]);

/** About four characters per token: an estimate that holds for every CLI. */
export function estimateTokens(text: string | null | undefined): number {
  return typeof text === 'string' && text.length > 0 ? Math.ceil(text.length / 4) : 0;
}

export interface RunBudgetInput {
  runId: string;
  agentId: string;
  model: string | null;
  mode?: string | null;
  resumed: boolean;
  rulesResent: boolean;
  historyCompacted: boolean;
  /** Everything the agent received. */
  composedPrompt: string;
  /** The per-turn request: earlier turns plus the person's message. */
  userRequest: string;
  /** The person's own message, when it is known apart from the history. */
  currentMessage: string | null;
  /** Skill bodies and index that were actually sent. */
  skills: Array<string | null | undefined>;
  /** The design system text that was actually sent. */
  designSystem: string | null | undefined;
  /** The prompt telemetry's named sections, for the detailed reading. */
  sections?: ReadonlyArray<{ kind: string; rawBytes: number; present?: boolean }>;
}

/**
 * Splits the composed prompt into its parts. The rules are what is left once
 * the parts that can be named are taken out, so the parts always add up to
 * the total.
 */
export function buildRunBudget(input: RunBudgetInput): RunPromptBudget {
  const total = estimateTokens(input.composedPrompt);
  const request = estimateTokens(input.userRequest);
  const message = Math.min(request, estimateTokens(input.currentMessage ?? input.userRequest));
  const history = Math.max(0, request - message);
  const skills = input.skills.reduce((sum, part) => sum + estimateTokens(part), 0);
  const designSystem = estimateTokens(input.designSystem);
  const rules = Math.max(0, total - request - skills - designSystem);
  return {
    runId: input.runId,
    agentId: input.agentId,
    model: input.model,
    mode: input.mode ?? null,
    resumed: input.resumed,
    rulesResent: input.rulesResent,
    historyCompacted: input.historyCompacted,
    sent: { rules, skills, designSystem, history, message, total },
    ...(input.sections?.length
      ? {
          sections: input.sections
            .filter((section) => section.present !== false && section.rawBytes > 0)
            .filter((section) => input.rulesResent || !STABLE_SECTION_KINDS.has(section.kind))
            .map((section) => ({ kind: section.kind, tokens: Math.ceil(section.rawBytes / 4) }))
            .sort((a, b) => b.tokens - a.tokens),
        }
      : {}),
  };
}

/** The run's lifecycle marks (`run.analyticsTelemetry`) as phase durations. */
export function budgetTimings(marks: Record<string, unknown> | null | undefined, finishedAt = Date.now()): RunPromptBudgetTimings {
  const at = (key: string) => {
    const value = marks?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  };
  const span = (from?: number, to?: number) =>
    from !== undefined && to !== undefined && to >= from ? to - from : undefined;
  const started = at('startChatRunStartedAt') ?? at('startRequestedAt');
  const promptReady = at('promptBuildEndAt');
  const spawned = at('processSpawnedAt');
  const firstToken = at('firstTokenAt') ?? at('firstVisibleOutputAt') ?? at('firstModelEventAt');
  const timings: RunPromptBudgetTimings = {};
  const prepareMs = span(started, promptReady);
  const launchMs = span(promptReady, spawned);
  const firstTokenMs = span(spawned, firstToken);
  const totalMs = span(started, finishedAt);
  if (prepareMs !== undefined) timings.prepareMs = prepareMs;
  if (launchMs !== undefined) timings.launchMs = launchMs;
  if (firstTokenMs !== undefined) timings.firstTokenMs = firstTokenMs;
  if (totalMs !== undefined) timings.totalMs = totalMs;
  return timings;
}

export async function writeRunBudget(runDir: string, budget: RunPromptBudget): Promise<void> {
  try {
    await fsp.mkdir(runDir, { recursive: true });
    await fsp.writeFile(path.join(runDir, RUN_BUDGET_FILE), JSON.stringify(budget, null, 2), 'utf8');
  } catch {
    // The meter is a reading, never a reason for a run to fail.
  }
}

export async function readRunBudget(runDir: string): Promise<RunPromptBudget | null> {
  try {
    return JSON.parse(await fsp.readFile(path.join(runDir, RUN_BUDGET_FILE), 'utf8')) as RunPromptBudget;
  } catch {
    return null;
  }
}

/** Adds the phase durations once the agent has finished. */
export async function recordRunBudgetTimings(
  runDir: string,
  marks: Record<string, unknown> | null | undefined,
): Promise<void> {
  const budget = await readRunBudget(runDir);
  if (!budget) return;
  await writeRunBudget(runDir, { ...budget, timings: budgetTimings(marks) });
}
