/**
 * What one run sent to its agent and how long each phase took.
 *   GET /api/runs/:runId/budget   → RunPromptBudget (404 when the run left none)
 *
 * Token figures are estimates of the text the app composed (about four
 * characters per token), so they work for every CLI, including the ones that
 * report no usage. What the model itself reported travels on the message's
 * `usage` / `request_usage` events.
 */
export interface RunPromptBudgetSent {
  /** The app's own instructions: charter, mode, tool contracts, protocol. */
  rules: number;
  /** Skill bodies and the skill index. */
  skills: number;
  /** The active design system. */
  designSystem: number;
  /** Earlier turns of the conversation (or their compact note). */
  history: number;
  /** The person's message for this turn. */
  message: number;
  total: number;
}

export interface RunPromptBudgetTimings {
  /** From the run starting to the prompt being ready. */
  prepareMs?: number;
  /** From the prompt being ready to the CLI process running. */
  launchMs?: number;
  /** From the process running to the model's first word. */
  firstTokenMs?: number;
  /** From the run starting to the agent finishing. */
  totalMs?: number;
}

export interface RunPromptBudget {
  runId: string;
  agentId: string;
  model: string | null;
  /** The conversation mode the turn ran in (`chat` is Ask, `design`, `plan`). */
  mode?: string | null;
  /** The CLI continued its own session (native resume). */
  resumed: boolean;
  /** The app's stable instructions went this turn (false when a resumed session already had them). */
  rulesResent: boolean;
  /** The conversation went as a state note plus the latest turns. */
  historyCompacted: boolean;
  sent: RunPromptBudgetSent;
  /** Every named section of the composed prompt, in estimated tokens, largest first. */
  sections?: Array<{ kind: string; tokens: number }>;
  timings?: RunPromptBudgetTimings;
}
