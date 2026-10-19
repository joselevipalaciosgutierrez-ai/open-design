import type { AgentEvent } from '../../types';
import { isTodoWriteToolName } from '@open-design/contracts';
import type { StatusTask } from './status-panel';
import { commandFile, commandOf, fileOf, toolKind, type ToolKind } from './tool-kind';

/**
 * The turn's work as a step list, for agents that never write a plan. It is what
 * the status panel falls back to, so a turn that only creates a PDF still reads
 * "Creating PDF" then "Created PDF" instead of an empty panel.
 */

type Lang = 'es' | 'en';
type StepKind = ToolKind | 'delegate';

/**
 * Steps are deliberately NOT literal. A tool call says `run_command python
 * make_pdf.py --name Levi`; the user needs "Creating PDF". So each call becomes
 * a verb plus a generic noun, plumbing the user never asked for (echo, run ids,
 * scratch briefs) is dropped, and repeats of the same step fold into one.
 */
const VERBS: Record<StepKind, { es: [string, string]; en: [string, string] }> = {
  write: { es: ['Creando', 'Creado'], en: ['Creating', 'Created'] },
  edit: { es: ['Editando', 'Editado'], en: ['Editing', 'Edited'] },
  delete: { es: ['Eliminando', 'Eliminado'], en: ['Deleting', 'Deleted'] },
  read: { es: ['Revisando', 'Revisado'], en: ['Reviewing', 'Reviewed'] },
  search: { es: ['Buscando', 'Búsqueda de'], en: ['Searching', 'Searched'] },
  exec: { es: ['Procesando', 'Procesado'], en: ['Processing', 'Processed'] },
  image: { es: ['Generando', 'Generada'], en: ['Generating', 'Generated'] },
  other: { es: ['Trabajando en', 'Listo:'], en: ['Working on', 'Done:'] },
  delegate: { es: ['Coordinando con agentes', 'Coordinado con agentes'], en: ['Coordinating agents', 'Coordinated agents'] },
};

/** What the work is about, from the file's extension. */
const NOUNS: Array<[RegExp, { es: string; en: string }]> = [
  [/\.pdf$/i, { es: 'PDF', en: 'PDF' }],
  [/\.(html?|css)$/i, { es: 'la página', en: 'the page' }],
  [/\.(png|jpe?g|gif|webp|svg|avif)$/i, { es: 'imágenes', en: 'images' }],
  [/\.(pptx?|key)$/i, { es: 'la presentación', en: 'the presentation' }],
  [/\.(md|txt|docx?)$/i, { es: 'el documento', en: 'the document' }],
  [/\.(json|ya?ml|csv|sketch)$/i, { es: 'los datos', en: 'the data' }],
  [/\.(tsx?|jsx?|py|mjs|cjs)$/i, { es: 'el código', en: 'the code' }],
];

const GENERIC_NOUN = { es: 'archivos', en: 'files' } as const;

/**
 * Pascal-case parameters (Antigravity's `CommandLine`, `AbsolutePath`) folded onto
 * the keys the shared helpers in `tool-kind.ts` read.
 */
const KEY_ALIASES: Record<string, string> = {
  commandline: 'command',
  absolutepath: 'file_path',
  targetfile: 'file_path',
  filepath: 'file_path',
  file: 'file_path',
  filename: 'file_path',
  path: 'file_path',
  searchquery: 'query',
};

function normalizeInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    const mapped = KEY_ALIASES[lower] ?? lower;
    if (!(mapped in out)) out[mapped] = value;
  }
  return out;
}

/** Antigravity's file tools, which the shared classifier does not know by name. */
function antigravityKind(name: string): ToolKind | null {
  const n = name.toLowerCase();
  if (n === 'write_to_file') return 'write';
  if (n === 'replace_file_content' || n === 'multi_replace_file_content') return 'edit';
  return null;
}

/** Host plumbing and scratch work: part of how the agent works, not of the task. */
function isPlumbing(command: string, path: string): boolean {
  if (command) {
    if (/\$\{?OD_[A-Z_]+|\bOD_[A-Z_]+=/.test(command)) return true;
    if (/^\s*(echo|printf|cd|pwd|true|sleep|mkdir|ls|cat)\b/.test(command) && !/>\s*\S/.test(command)) return true;
  }
  if (path && /(^|[\\/])(scratch|\.od|\.tmp)([\\/]|$)|(^|[\\/])brief[^\\/]*\.txt$/i.test(path)) return true;
  return false;
}

function describeStep(
  name: string,
  rawInput: unknown,
): { kind: StepKind; nounKey: string } | null {
  const input = normalizeInput(rawInput);
  const command = commandOf(input);
  const path =
    fileOf(input)?.path ??
    (command ? (commandFile(command)?.path ?? command.match(/[\w./-]+\.[A-Za-z0-9]{2,5}\b/)?.[0]) : '') ??
    '';
  if (/(^|[\s/])(od|cli\.js)\b.*\brun start\b/.test(command)) {
    return { kind: 'delegate', nounKey: '' };
  }
  if (isPlumbing(command, path)) return null;
  const kind = antigravityKind(name) ?? toolKind(name, input);
  const noun = NOUNS.find(([re]) => re.test(path))?.[1];
  // Running a script is not "working on the code": it makes something else.
  if (kind === 'exec' && noun?.en === 'the code') return { kind, nounKey: '' };
  return { kind, nounKey: noun ? noun.en : kind === 'search' || path ? GENERIC_NOUN.en : '' };
}

function nounFor(nounKey: string, lang: Lang): string {
  const hit = NOUNS.find(([, n]) => n.en === nounKey)?.[1];
  if (hit) return hit[lang];
  return nounKey === GENERIC_NOUN.en ? GENERIC_NOUN[lang] : '';
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

  // One step per (kind, noun); a later call to the same step updates it in place.
  const order: string[] = [];
  const byKey = new Map<string, { kind: StepKind; nounKey: string; marks: StatusTask['mark'][] }>();
  for (const event of message.events) {
    if (event.kind !== 'tool_use' || isTodoWriteToolName(event.name)) continue;
    const step = describeStep(event.name, event.input);
    if (!step) continue;
    const key = `${step.kind}|${step.nounKey}`;
    const mark: StatusTask['mark'] = finished.has(event.id) ? 'done' : live ? 'running' : 'stopped';
    const entry = byKey.get(key);
    if (entry) entry.marks.push(mark);
    else {
      byKey.set(key, { kind: step.kind, nounKey: step.nounKey, marks: [mark] });
      order.push(key);
    }
  }

  const steps: StatusTask[] = order.map((key) => {
    const { kind, nounKey, marks } = byKey.get(key)!;
    const mark: StatusTask['mark'] = marks.includes('running')
      ? 'running'
      : marks.includes('stopped')
        ? 'stopped'
        : 'done';
    const [doing, did] = VERBS[kind][lang];
    const noun = nounFor(nounKey, lang);
    return { content: `${mark === 'done' ? did : doing}${noun ? ` ${noun}` : ''}`, mark };
  });
  return steps.slice(-(input.max ?? 12));
}
