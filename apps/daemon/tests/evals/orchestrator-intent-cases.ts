/**
 * Cases for measuring how well a CLI follows the orchestrator directive.
 *
 * No source can guarantee a model tells a conversation from a task, so this is
 * how that is measured instead of assumed: run the same phrases through each CLI
 * and look at the accuracy. The runner is `orchestrator-intent-eval.ts`; it
 * spends CLI quota, so it only runs when asked.
 *
 * Roster these were written against: Diseño (interfaces and layout), Desarrollo
 * (code) and QA (review). Each case lists the outcomes that are acceptable, not
 * a single right one: asking before opening the panel is as correct as
 * delegating straight away for a design request made from the chat.
 */

export type Outcome =
  /** Replied on its own: no delegation, no question back. */
  | 'answer'
  /** Delegated to at least one agent. */
  | 'delegate'
  /** Asked the user something before acting (the panel question, a clarification). */
  | 'ask'
  /** Recorded a standing instruction in ORCHESTRATOR.md. */
  | 'rule';

export type CaseKind =
  | 'conversation'
  | 'task'
  | 'explicit-delegation'
  | 'ambiguous'
  | 'standing-rule';

export interface IntentCase {
  id: string;
  kind: CaseKind;
  /** Mode the conversation is in when the message arrives. */
  mode: 'chat' | 'design';
  text: string;
  /** Any of these counts as following the directive. */
  accept: readonly Outcome[];
}

export const EVAL_AGENTS = [
  { name: 'Diseño', emoji: '🎨', role: 'Interfaces, layout y sistemas de diseño' },
  { name: 'Desarrollo', emoji: '🛠️', role: 'Implementa interfaces en código' },
  { name: 'QA', emoji: '🧪', role: 'Revisa calidad, accesibilidad y bugs' },
] as const;

const conversation = (id: string, text: string, mode: IntentCase['mode'] = 'chat'): IntentCase => ({
  id,
  kind: 'conversation',
  mode,
  text,
  // A greeting is routinely answered with a question ("¿en qué te ayudo?"), which
  // is not orchestration. What a conversation must never do is delegate.
  accept: ['answer', 'ask'],
});

const task = (id: string, text: string): IntentCase => ({
  id,
  kind: 'task',
  mode: 'chat',
  text,
  // From the chat the first design request is answered with the panel question.
  accept: ['delegate', 'ask'],
});

const explicit = (id: string, text: string, mode: IntentCase['mode'] = 'chat'): IntentCase => ({
  id,
  kind: 'explicit-delegation',
  mode,
  text,
  accept: ['delegate'],
});

const ambiguous = (id: string, text: string): IntentCase => ({
  id,
  kind: 'ambiguous',
  mode: 'chat',
  text,
  // Not enough to act on: a question back is right, and so is a short reply.
  // Delegating on a guess is the failure this kind exists to catch.
  accept: ['ask', 'answer'],
});

const rule = (id: string, text: string): IntentCase => ({
  id,
  kind: 'standing-rule',
  mode: 'chat',
  text,
  accept: ['rule', 'answer'],
});

export const INTENT_CASES: readonly IntentCase[] = [
  // Conversation: must never delegate, never label itself.
  conversation('conv-greeting', 'hola'),
  conversation('conv-good-morning', 'buenos días'),
  conversation('conv-thanks', 'gracias, eso era todo'),
  conversation('conv-swiss-grid', '¿Qué es un grid suizo?'),
  conversation('conv-padding-margin', '¿Cuál es la diferencia entre padding y margin?'),
  conversation('conv-design-system', 'Explícame en dos líneas qué es un design system'),
  conversation('conv-compare-fonts', '¿Qué tipografía queda mejor en un tema oscuro, Inter o Geist?'),
  conversation('conv-color-name', '¿Cómo se llama el color #FF5733?'),
  conversation('conv-who-are-you', '¿Qué puedes hacer?'),
  conversation('conv-design-mode-question', '¿Qué es el contraste AA?', 'design'),
  conversation('conv-design-mode-thanks', 'perfecto, gracias', 'design'),

  // Work that clearly belongs to an agent.
  task('task-landing', 'Hazme una landing para una app de meditación'),
  task('task-dashboard', 'Necesito el diseño de un dashboard de analítica para un SaaS'),
  task('task-login', 'Diseña una pantalla de login con registro social'),
  task('task-component', 'Crea un componente de botón en React con variantes'),
  task('task-bugs', 'Revisa si el formulario de contacto tiene bugs de accesibilidad'),
  task('task-two-parts', 'Diseña la pantalla de ajustes y luego revísala'),

  // The user names who should do it.
  explicit('explicit-design', 'Pásale esto al agente de Diseño: una tarjeta de precios con tres planes'),
  explicit('explicit-qa', 'Dile a QA que revise el login'),
  explicit('explicit-dev', 'Que Desarrollo implemente el header de la landing'),
  explicit('explicit-at-mention', '@Diseño haz un hero con un titular grande'),
  explicit('explicit-design-mode', 'Pásale esto a QA: revisa el contraste de la página', 'design'),

  // Not enough to act on.
  ambiguous('ambig-yesterday', 'lo de ayer'),
  ambiguous('ambig-modern', '¿Y si lo hacemos más moderno?'),
  ambiguous('ambig-contrast', 'algo con más contraste'),
  ambiguous('ambig-improve', 'mejóralo'),

  // Instructions that outlive the message.
  rule('rule-ui-to-design', 'A partir de ahora, todo lo de interfaz se lo pasas al agente de Diseño'),
  rule('rule-no-panel', 'Nunca me abras el panel de diseño, trabaja siempre desde el chat'),
  rule('rule-short-answers', 'Siempre respóndeme corto y en español'),
];

export interface ObservedOutcome {
  /** Runs the orchestrator started during the turn. */
  delegateCount: number;
  /** The assistant's final reply, as plain text. */
  replyText: string;
  /** Whether ORCHESTRATOR.md exists in the project afterwards. */
  wroteRulesFile: boolean;
}

/**
 * What a turn amounted to. Delegating wins over everything: it is the one
 * action with a cost, and the one a "conversation" case must never show.
 */
export function classifyOutcome(observed: ObservedOutcome): Outcome {
  if (observed.delegateCount > 0) return 'delegate';
  if (observed.wroteRulesFile) return 'rule';
  const reply = observed.replyText.trim();
  // A question to the user, in the last sentence or last line, is asking.
  const tail = reply.split(/\n+/).filter(Boolean).pop() ?? '';
  if (/[?¿]\s*$/.test(tail) || /\?\s*(\*\*|_|`)?\s*$/.test(tail)) return 'ask';
  return 'answer';
}

export interface CaseResult {
  id: string;
  kind: CaseKind;
  observed: Outcome;
  passed: boolean;
}

export function scoreCase(testCase: IntentCase, observed: ObservedOutcome): CaseResult {
  const outcome = classifyOutcome(observed);
  return {
    id: testCase.id,
    kind: testCase.kind,
    observed: outcome,
    passed: testCase.accept.includes(outcome),
  };
}

export interface Summary {
  total: number;
  passed: number;
  accuracy: number;
  byKind: Record<string, { total: number; passed: number }>;
  /** A conversation case that delegated: the costly mistake, tracked on its own. */
  overDelegations: string[];
  /** A task or explicit case that did nothing: the quiet mistake. */
  underDelegations: string[];
}

export function summarize(results: readonly CaseResult[]): Summary {
  const byKind: Summary['byKind'] = {};
  for (const result of results) {
    const bucket = (byKind[result.kind] ??= { total: 0, passed: 0 });
    bucket.total += 1;
    if (result.passed) bucket.passed += 1;
  }
  const passed = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed,
    accuracy: results.length === 0 ? 0 : passed / results.length,
    byKind,
    overDelegations: results
      .filter((r) => (r.kind === 'conversation' || r.kind === 'ambiguous') && r.observed === 'delegate')
      .map((r) => r.id),
    underDelegations: results
      .filter((r) => r.kind === 'explicit-delegation' && r.observed !== 'delegate')
      .map((r) => r.id),
  };
}
