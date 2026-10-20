import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { PersistedAgentEvent, RunPromptBudget } from '@open-design/contracts';
import { useI18n } from '../i18n';
import styles from './TurnMeter.module.css';

/** What the model itself reported for the turn, from the message's events. */
export interface ReportedUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  durationMs?: number;
  costUsd?: number;
}

export function reportedUsageFromEvents(events: readonly PersistedAgentEvent[] | undefined): ReportedUsage | null {
  if (!events?.length) return null;
  let usage: ReportedUsage | null = null;
  let cached = 0;
  for (const event of events) {
    if (event.kind === 'usage') {
      usage = {
        ...(event.inputTokens !== undefined ? { inputTokens: event.inputTokens } : {}),
        ...(event.outputTokens !== undefined ? { outputTokens: event.outputTokens } : {}),
        ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
        ...(event.costUsd !== undefined ? { costUsd: event.costUsd } : {}),
      };
    } else if (event.kind === 'request_usage') {
      cached += event.cacheReadInputTokens ?? 0;
    }
  }
  if (!usage && cached === 0) return null;
  return { ...(usage ?? {}), ...(cached > 0 ? { cachedTokens: cached } : {}) };
}

interface Copy {
  open: string;
  title: string;
  sentTitle: string;
  parts: Record<keyof Omit<RunPromptBudget['sent'], 'total'>, string>;
  total: string;
  estimate: string;
  modelTitle: string;
  input: string;
  cached: string;
  output: string;
  cost: string;
  timeTitle: string;
  prepare: string;
  launch: string;
  firstToken: string;
  totalTime: string;
  resumed: string;
  fresh: string;
  rulesSkipped: string;
  compacted: string;
  loading: string;
  missing: string;
  detailTitle: string;
  mode: (mode: string) => string;
  sectionNames: Record<string, string>;
}

const ES: Copy = {
  open: 'Tokens de esta respuesta',
  title: 'Lo que costó esta respuesta',
  sentTitle: 'Lo que la app envió',
  parts: {
    rules: 'Reglas de la app',
    skills: 'Skills',
    designSystem: 'Sistema de diseño',
    history: 'Historial',
    message: 'Tu mensaje',
  },
  total: 'Total',
  estimate: 'Estimado (≈4 caracteres por token).',
  modelTitle: 'Lo que reportó el modelo',
  input: 'Entrada',
  cached: 'De caché',
  output: 'Salida',
  cost: 'Coste',
  timeTitle: 'Tiempo',
  prepare: 'Preparar el prompt',
  launch: 'Arrancar el CLI',
  firstToken: 'Hasta la primera palabra',
  totalTime: 'Total',
  resumed: 'Retomó su sesión: no se reenvió la conversación.',
  fresh: 'Sesión nueva: se envió todo.',
  rulesSkipped: 'Las reglas no se reenviaron: la sesión ya las tenía.',
  compacted: 'El historial fue como nota de estado más los últimos turnos.',
  loading: 'Cargando…',
  missing: 'Esta respuesta no tiene medición.',
  detailTitle: 'Detalle',
  mode: (mode) => `Modo: ${({ chat: 'Preguntar', design: 'Diseño', plan: 'Plan' } as Record<string, string>)[mode] ?? mode}.`,
  sectionNames: {
    daemonSystemPrompt: 'Instrucciones del modo',
    skillPrompt: 'Skill activa',
    clientSystemPrompt: 'Protocolo del turno',
    runtimeToolPrompt: 'Herramientas',
    pluginStagePrompt: 'Plugin',
    designSystemPrompt: 'Sistema de diseño',
    cwdHint: 'Carpeta',
    userRequest: 'Conversación',
    researchCommandContract: 'Investigación',
    runContextPrompt: 'Contexto',
  },
};

const EN: Copy = {
  open: 'Tokens for this reply',
  title: 'What this reply cost',
  sentTitle: 'What the app sent',
  parts: {
    rules: 'App rules',
    skills: 'Skills',
    designSystem: 'Design system',
    history: 'History',
    message: 'Your message',
  },
  total: 'Total',
  estimate: 'Estimated (≈4 characters per token).',
  modelTitle: 'What the model reported',
  input: 'Input',
  cached: 'From cache',
  output: 'Output',
  cost: 'Cost',
  timeTitle: 'Time',
  prepare: 'Preparing the prompt',
  launch: 'Starting the CLI',
  firstToken: 'Until the first word',
  totalTime: 'Total',
  resumed: 'Continued its session: the conversation was not resent.',
  fresh: 'New session: everything was sent.',
  rulesSkipped: 'The rules were not resent: the session already had them.',
  compacted: 'The history went as a state note plus the latest turns.',
  loading: 'Loading…',
  missing: 'This reply has no reading.',
  detailTitle: 'Detail',
  mode: (mode) => `Mode: ${({ chat: 'Ask', design: 'Design', plan: 'Plan' } as Record<string, string>)[mode] ?? mode}.`,
  sectionNames: {
    daemonSystemPrompt: 'Mode instructions',
    skillPrompt: 'Active skill',
    clientSystemPrompt: 'Turn protocol',
    runtimeToolPrompt: 'Tools',
    pluginStagePrompt: 'Plugin',
    designSystemPrompt: 'Design system',
    cwdHint: 'Folder',
    userRequest: 'Conversation',
    researchCommandContract: 'Research',
    runContextPrompt: 'Context',
  },
};

export function formatTokens(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatSeconds(ms: number | undefined): string | null {
  return typeof ms === 'number' ? `${(ms / 1000).toFixed(1)} s` : null;
}

/**
 * A small reading at the end of a reply: how many tokens it took. Opening it
 * shows what the app sent by part, what the model reported, and how long each
 * phase took. The breakdown is fetched only when it is opened.
 */
export function TurnMeter({ runId, usage }: { runId: string | null | undefined; usage: ReportedUsage | null }) {
  const { locale } = useI18n();
  const copy = locale.toLowerCase().startsWith('es') ? ES : EN;
  const [open, setOpen] = useState(false);
  // The panel lives in a portal, which only exists on the client: never in a server render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [budget, setBudget] = useState<RunPromptBudget | null | 'missing'>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties>({ left: 0, top: 0 });

  // The panel lives in a layer of its own (a portal), so no scrolling chat
  // column can clip it. It opens above the button, slides left to stay inside
  // the window, and drops below when there is no room above.
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const gap = 8;
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const left = Math.min(Math.max(gap, trigger.left), window.innerWidth - width - gap);
      const above = trigger.top - height - gap;
      const top = above >= gap ? above : Math.min(trigger.bottom + gap, window.innerHeight - height - gap);
      setPlace({ left, top });
    };
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, budget]);

  useEffect(() => {
    if (!open || budget !== null || !runId) return;
    let alive = true;
    void (async (): Promise<RunPromptBudget | 'missing'> => {
      try {
        const resp = await fetch(`/api/runs/${encodeURIComponent(runId)}/budget`);
        return resp.ok ? ((await resp.json()) as RunPromptBudget) : 'missing';
      } catch {
        return 'missing';
      }
    })().then((value) => {
      if (alive) setBudget(value);
    });
    return () => {
      alive = false;
    };
  }, [open, budget, runId]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!runId && !usage) return null;
  const headline = usage?.inputTokens !== undefined
    ? formatTokens(usage.inputTokens + (usage.outputTokens ?? 0))
    : budget && budget !== 'missing'
      ? `≈${formatTokens(budget.sent.total)}`
      : null;

  const loaded = budget && budget !== 'missing' ? budget : null;
  const timings = loaded?.timings;
  const timeRows: Array<[string, string | null]> = [
    [copy.prepare, formatSeconds(timings?.prepareMs)],
    [copy.launch, formatSeconds(timings?.launchMs)],
    [copy.firstToken, formatSeconds(timings?.firstTokenMs)],
    [copy.totalTime, formatSeconds(timings?.totalMs ?? usage?.durationMs)],
  ];

  return (
    <span className={styles.root} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-label={copy.open}
        title={copy.open}
        data-testid="turn-meter"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden className={styles.glyph}>◔</span>
        {headline ? <span className={styles.value}>{headline}</span> : null}
      </button>
      {!mounted ? null : createPortal(
      <div
        ref={panelRef}
        className={styles.panel}
        style={place}
        data-open={open ? 'true' : 'false'}
        role="dialog"
        aria-label={copy.title}
        data-testid="turn-meter-panel"
      >
        <strong className={styles.title}>{copy.title}</strong>

        <span className={styles.section}>{copy.sentTitle}</span>
        {budget === null && runId ? <p className={styles.note}>{copy.loading}</p> : null}
        {budget === 'missing' || (!runId && !loaded) ? <p className={styles.note}>{copy.missing}</p> : null}
        {loaded ? (
          <>
            <dl className={styles.rows}>
              {(Object.keys(copy.parts) as Array<keyof Copy['parts']>).map((key) =>
                loaded.sent[key] > 0 ? (
                  <div key={key} className={styles.row}>
                    <dt>{copy.parts[key]}</dt>
                    <dd>
                      <span className={styles.bar} style={{ inlineSize: `${Math.max(4, (loaded.sent[key] / Math.max(1, loaded.sent.total)) * 100)}%` }} />
                      ≈{formatTokens(loaded.sent[key])}
                    </dd>
                  </div>
                ) : null,
              )}
              <div className={`${styles.row} ${styles.totalRow}`}>
                <dt>{copy.total}</dt>
                <dd>≈{formatTokens(loaded.sent.total)}</dd>
              </div>
            </dl>
            <p className={styles.note}>
              {loaded.resumed ? copy.resumed : copy.fresh}
              {loaded.resumed && !loaded.rulesResent ? ` ${copy.rulesSkipped}` : ''}
              {loaded.historyCompacted ? ` ${copy.compacted}` : ''}
              {loaded.mode ? ` ${copy.mode(loaded.mode)}` : ''} {copy.estimate}
            </p>
            {loaded.sections?.length ? (
              <>
                <span className={styles.section}>{copy.detailTitle}</span>
                <dl className={styles.rows}>
                  {loaded.sections.slice(0, 6).map((section) => (
                    <div key={section.kind} className={styles.row}>
                      <dt>{copy.sectionNames[section.kind] ?? section.kind}</dt>
                      <dd>≈{formatTokens(section.tokens)}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}
          </>
        ) : null}

        {usage ? (
          <>
            <span className={styles.section}>{copy.modelTitle}</span>
            <dl className={styles.rows}>
              {usage.inputTokens !== undefined ? (
                <div className={styles.row}><dt>{copy.input}</dt><dd>{formatTokens(usage.inputTokens)}</dd></div>
              ) : null}
              {usage.cachedTokens ? (
                <div className={styles.row}><dt>{copy.cached}</dt><dd>{formatTokens(usage.cachedTokens)}</dd></div>
              ) : null}
              {usage.outputTokens !== undefined ? (
                <div className={styles.row}><dt>{copy.output}</dt><dd>{formatTokens(usage.outputTokens)}</dd></div>
              ) : null}
              {usage.costUsd ? (
                <div className={styles.row}><dt>{copy.cost}</dt><dd>${usage.costUsd.toFixed(4)}</dd></div>
              ) : null}
            </dl>
          </>
        ) : null}

        {timeRows.some(([, value]) => value) ? (
          <>
            <span className={styles.section}>{copy.timeTitle}</span>
            <dl className={styles.rows}>
              {timeRows.map(([label, value]) =>
                value ? (
                  <div key={label} className={styles.row}><dt>{label}</dt><dd>{value}</dd></div>
                ) : null,
              )}
            </dl>
          </>
        ) : null}
      </div>,
      document.body,
      )}
    </span>
  );
}
