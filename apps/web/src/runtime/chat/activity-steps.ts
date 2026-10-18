import type { AgentEvent } from '../../types';
import { isTodoWriteToolName } from '@open-design/contracts';
import type { StatusTask } from './status-panel';

/**
 * The turn's work as a step list, for agents that never write a plan: one step
 * per tool call, "done" once its result arrived. It is what the status panel
 * falls back to, so a turn that only creates a PDF still reads "Creating
 * report.pdf" then "Created report.pdf" instead of an empty panel.
 */

type Lang = 'es' | 'en';

const VERBS: Record<string, { es: [string, string]; en: [string, string] }> = {
  write: { es: ['Creando', 'Creado'], en: ['Creating', 'Created'] },
  edit: { es: ['Editando', 'Editado'], en: ['Editing', 'Edited'] },
  read: { es: ['Leyendo', 'Leído'], en: ['Reading', 'Read'] },
  search: { es: ['Buscando', 'Búsqueda'], en: ['Searching', 'Searched'] },
  web: { es: ['Consultando la web', 'Web consultada'], en: ['Browsing the web', 'Browsed the web'] },
  run: { es: ['Ejecutando', 'Ejecutado'], en: ['Running', 'Ran'] },
  delegate: { es: ['Delegando a un agente', 'Delegado a un agente'], en: ['Delegating to an agent', 'Delegated to an agent'] },
  other: { es: ['Trabajando', 'Hecho'], en: ['Working', 'Done'] },
};

function kindOf(name: string, command: string): keyof typeof VERBS {
  const n = name.toLowerCase();
  if (/\bod\b.*\brun start\b|cli\.js.*\brun start\b/.test(command)) return 'delegate';
  if (/write|create|save/.test(n)) return 'write';
  if (/edit|patch|replace/.test(n)) return 'edit';
  if (/read|view|open|cat/.test(n)) return 'read';
  if (/grep|glob|search|find|list|ls/.test(n) && !/web/.test(n)) return 'search';
  if (/web|fetch|browse/.test(n)) return 'web';
  if (/bash|shell|exec|run|command/.test(n)) return 'run';
  return 'other';
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function targetOf(input: unknown, kind: keyof typeof VERBS): string {
  if (!input || typeof input !== 'object') return '';
  const o = input as Record<string, unknown>;
  const path = str(o.file_path) || str(o.path) || str(o.filePath) || str(o.filename) || str(o.file);
  if (path) return path.split('/').pop() ?? path;
  if (kind === 'delegate') return '';
  const text = str(o.description) || str(o.command) || str(o.query) || str(o.pattern) || str(o.url);
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > 60 ? `${line.slice(0, 57)}…` : line;
}

export function buildActivitySteps(input: {
  messages: ReadonlyArray<{ role: string; events?: AgentEvent[] | undefined; runStatus?: string | undefined }> | undefined;
  locale: string;
  /** Most steps kept: the newest ones. */
  max?: number;
}): StatusTask[] {
  const lang: Lang = input.locale.toLowerCase().startsWith('es') ? 'es' : 'en';
  const message = [...(input.messages ?? [])].reverse().find((m) => m.role === 'assistant' && m.events?.length);
  if (!message?.events) return [];
  const live = message.runStatus === 'running' || message.runStatus === 'queued';
  const finished = new Set<string>();
  for (const event of message.events) if (event.kind === 'tool_result') finished.add(event.toolUseId);

  const steps: StatusTask[] = [];
  for (const event of message.events) {
    if (event.kind !== 'tool_use' || isTodoWriteToolName(event.name)) continue;
    const command = str((event.input as Record<string, unknown> | null)?.command);
    const kind = kindOf(event.name, command);
    const done = finished.has(event.id);
    const mark: StatusTask['mark'] = done ? 'done' : live ? 'running' : 'stopped';
    const [doing, did] = VERBS[kind]![lang];
    const target = targetOf(event.input, kind);
    steps.push({ content: `${mark === 'done' ? did : doing}${target ? ` ${target}` : ''}`, mark });
  }
  const max = input.max ?? 12;
  return steps.slice(-max);
}
