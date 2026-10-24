/**
 * A long conversation, sent to a CLI that cannot resume its own session.
 *
 * Those CLIs start from nothing on every turn, so the web sends the whole
 * rendered transcript (`## user` / `## assistant` blocks) each time and the
 * cost grows with every message. Past a budget, the daemon writes the full
 * transcript to a file in the run's own folder and sends a compact version
 * instead: a state note (the first request, then one line per earlier
 * exchange), the latest turns word for word, and where the full text is. The
 * agent reads the file only when it needs a detail the note leaves out, the
 * same way it reads a skill.
 *
 * Short conversations are left exactly as they are.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';

export interface TranscriptTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ParsedTranscript {
  /** Text before the first turn (the web's context warning, when there is one). */
  preamble: string;
  turns: TranscriptTurn[];
}

/** Above this many characters (about 6k tokens) the transcript is compacted. */
export const TRANSCRIPT_COMPACT_BUDGET_CHARS = 24_000;
/** How much of the tail is kept word for word. */
const VERBATIM_TAIL_CHARS = 12_000;
/** Earlier exchanges listed in the state note before older ones are only counted. */
const MAX_NOTED_EXCHANGES = 40;
const NOTE_LINE_CHARS = 180;
/**
 * The boundary between the note and the verbatim tail moves only in steps of
 * this many exchanges, and older notes are dropped in blocks of
 * `NOTE_OMIT_STEP`. Between steps every earlier byte of the prompt is the same
 * as the previous turn's, so the upstream prompt cache keeps hitting; a sliding
 * boundary would rewrite the note on every turn.
 */
const BOUNDARY_STEP_EXCHANGES = 4;
const NOTE_OMIT_STEP = 10;
/** Quantizing may grow the tail, but never past this multiple of its budget. */
const MAX_TAIL_GROWTH = 2;
const FIRST_REQUEST_CHARS = 600;

const ROLE_LINE = /^## (user|assistant)[ \t]*\r?$/;

/**
 * Splits the web's rendered transcript into turns. Role lines inside a message
 * are escaped by the web (`\## user`), so only real boundaries match. Returns
 * null when the text is not a transcript (a headless caller's plain message).
 */
export function parseTranscript(text: string): ParsedTranscript | null {
  const lines = text.split('\n');
  const turns: TranscriptTurn[] = [];
  const preamble: string[] = [];
  let current: { role: TranscriptTurn['role']; lines: string[] } | null = null;
  for (const line of lines) {
    const match = ROLE_LINE.exec(line);
    if (match) {
      if (current) turns.push({ role: current.role, content: current.lines.join('\n').trim() });
      current = { role: match[1] as TranscriptTurn['role'], lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (current) turns.push({ role: current.role, content: current.lines.join('\n').trim() });
  if (turns.length === 0) return null;
  return { preamble: preamble.join('\n').trim(), turns };
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

function renderTurn(turn: TranscriptTurn): string {
  return `## ${turn.role}\n${turn.content}`;
}

/**
 * How many turns at the end stay word for word: the latest user turn always,
 * the reply before it always, then whole turns while they fit the tail budget.
 */
function verbatimTailStart(turns: TranscriptTurn[]): number {
  let start = turns.length;
  let used = 0;
  while (start > 0) {
    const size = turns[start - 1]!.content.length + 16;
    const mandatory = turns.length - start < 2;
    if (!mandatory && used + size > VERBATIM_TAIL_CHARS) break;
    used += size;
    start -= 1;
  }
  return start;
}

/**
 * `verbatimTailStart` rounded back to a step boundary (a user turn that begins
 * an exchange whose index is a multiple of `BOUNDARY_STEP_EXCHANGES`). Falls
 * back to the exact start when rounding would swell the tail past its cap.
 */
function steppedTailStart(turns: TranscriptTurn[], exact: number): number {
  let exchangeIndex = 0;
  let stepped = 0;
  for (let i = 0; i < exact; i += 1) {
    if (turns[i]!.role !== 'user') continue;
    if (exchangeIndex % BOUNDARY_STEP_EXCHANGES === 0) stepped = i;
    exchangeIndex += 1;
  }
  // Nothing earlier than the first step: keep the exact boundary, or a long
  // conversation of a few huge exchanges would go uncompacted.
  if (stepped === 0) return exact;
  const tailChars = turns.slice(stepped).reduce((sum, t) => sum + t.content.length + 16, 0);
  return tailChars > VERBATIM_TAIL_CHARS * MAX_TAIL_GROWTH ? exact : stepped;
}

export interface CompactedTranscript {
  /** What the agent receives in place of the transcript. */
  prompt: string;
  /** The full transcript, for the file the prompt points to. */
  full: string;
}

/**
 * The compact version of a long transcript, or null when it is short enough
 * (or not a transcript) and should go as it is. `fileRef` is the path the
 * agent is told to read.
 */
export function compactTranscript(
  text: string,
  fileRef: string,
  budget = TRANSCRIPT_COMPACT_BUDGET_CHARS,
): CompactedTranscript | null {
  if (text.length <= budget) return null;
  const parsed = parseTranscript(text);
  if (!parsed) return null;
  const { turns, preamble } = parsed;
  const tailStart = steppedTailStart(turns, verbatimTailStart(turns));
  const earlier = turns.slice(0, tailStart);
  if (earlier.length === 0) return null;

  const firstRequest = earlier.find((turn) => turn.role === 'user');
  const exchanges: string[] = [];
  for (let i = 0; i < earlier.length; i += 1) {
    const turn = earlier[i]!;
    if (turn.role !== 'user') continue;
    const reply = earlier[i + 1]?.role === 'assistant' ? earlier[i + 1]!.content : '';
    exchanges.push(
      `user: ${oneLine(turn.content, NOTE_LINE_CHARS)}${reply ? ` → assistant: ${oneLine(reply, NOTE_LINE_CHARS)}` : ''}`,
    );
  }
  const overflow = Math.max(0, exchanges.length - MAX_NOTED_EXCHANGES);
  const omitted = overflow - (overflow % NOTE_OMIT_STEP);
  const noted = exchanges.slice(omitted);

  const note = [
    '## Conversation so far (compacted by Open Design)',
    `This conversation is long, so its earlier part is summarized here. The full text, every message word for word, is in \`${fileRef}\`. Read it only when you need a detail that is not below; do not mention the file to the person.`,
    '',
    '### State',
    ...(firstRequest ? [`First request: ${oneLine(firstRequest.content, FIRST_REQUEST_CHARS)}`, ''] : []),
    'Earlier exchanges, oldest first:',
    ...(omitted > 0 ? [`(${omitted} older exchanges are only in the file.)`] : []),
    ...noted.map((line, index) => `${index + 1 + omitted}. ${line}`),
    '',
    '### Latest turns, word for word',
  ].join('\n');

  const tail = turns.slice(tailStart).map(renderTurn).join('\n\n');
  const prompt = [preamble, note, tail].filter(Boolean).join('\n\n');
  if (prompt.length >= text.length) return null;
  return { prompt, full: text };
}

/**
 * Compacts the transcript for a run and writes the full text next to the run.
 * Falls back to the transcript as it is when the file cannot be written, so a
 * full disk never costs the agent its context.
 */
export async function compactTranscriptForRun(
  text: string,
  runDir: string,
): Promise<{ prompt: string; filePath: string | null }> {
  const filePath = path.join(runDir, 'conversation.md');
  const compacted = compactTranscript(text, filePath);
  if (!compacted) return { prompt: text, filePath: null };
  try {
    await fsp.mkdir(runDir, { recursive: true });
    await fsp.writeFile(filePath, `${compacted.full}\n`, 'utf8');
  } catch {
    return { prompt: text, filePath: null };
  }
  return { prompt: compacted.prompt, filePath };
}
