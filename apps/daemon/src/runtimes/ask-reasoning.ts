/**
 * How hard the agent thinks when nobody chose. A conversation in Ask mode is
 * mostly talk: a greeting, a question, a short answer. At the agent's default
 * effort, Antigravity spent ~13 s and ~600 reasoning tokens to answer "hola".
 * So an Ask-mode run that reaches the user directly starts at `low`, when the
 * agent offers it. An effort the user picked always wins, and runs another run
 * started (delegates doing real work) keep their default.
 */
export function defaultReasoningForRun(input: {
  chosen: string | null;
  sessionMode: string | null | undefined;
  delegated: boolean;
  options: ReadonlyArray<{ id: string }> | undefined;
}): string | null {
  if (input.chosen) return input.chosen;
  if (input.sessionMode !== 'chat' || input.delegated) return null;
  return input.options?.some((option) => option.id === 'low') ? 'low' : null;
}
