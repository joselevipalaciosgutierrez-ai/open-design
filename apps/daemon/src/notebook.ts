/**
 * Each project's notebook: one line per finished run (who, what was asked,
 * how it ended, which files) and the decisions Lev or an agent writes down.
 * It is what lets Lev, and a project's own chat, remember what happened in a
 * project without reading its conversations. Plain Markdown in the daemon's
 * data (`<dataDir>/notebooks/<projectId>.md`); the person can read and edit
 * it from the project card and with `od project notebook`.
 */
import fs, { promises as fsp } from 'node:fs';
import path from 'node:path';

/** A run older than this when it is reported as ended was read back from disk, not just finished. */
export const NOTEBOOK_FRESH_RUN_MS = 5 * 60 * 1000;

/** Entries kept per project; older ones fall off the top. */
export const NOTEBOOK_MAX_ENTRIES = 200;
const REQUEST_CHARS = 110;
const NOTE_CHARS = 400;

export function notebookPath(dataDir: string, projectId: string): string {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(projectId)) throw new Error('invalid project id');
  return path.join(dataDir, 'notebooks', `${projectId}.md`);
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

function stamp(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function readNotebook(dataDir: string, projectId: string): Promise<string> {
  try {
    return await fsp.readFile(notebookPath(dataDir, projectId), 'utf8');
  } catch {
    return '';
  }
}

/** The last `count` entries, oldest first. */
export function lastEntries(text: string, count: number): string[] {
  return text.split('\n').filter((line) => line.startsWith('- ')).slice(-count);
}

export async function writeNotebook(dataDir: string, projectId: string, text: string): Promise<void> {
  const file = notebookPath(dataDir, projectId);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, text.endsWith('\n') || text === '' ? text : `${text}\n`, 'utf8');
}

export async function appendNotebookEntry(dataDir: string, projectId: string, entry: string, at = Date.now()): Promise<void> {
  const current = await readNotebook(dataDir, projectId);
  const entries = lastEntries(current, NOTEBOOK_MAX_ENTRIES - 1);
  entries.push(`- ${stamp(at)} · ${entry}`);
  await writeNotebook(dataDir, projectId, `# Notebook\n\n${entries.join('\n')}\n`);
}

/** A decision or fact someone wants the project to remember. */
export async function addNotebookNote(dataDir: string, projectId: string, note: string, by = 'Lev'): Promise<void> {
  const text = oneLine(note, NOTE_CHARS);
  if (!text) throw new Error('the note is empty');
  await appendNotebookEntry(dataDir, projectId, `${by} · nota: ${text}`);
}

export interface NotebookRun {
  projectId?: string | null;
  agentId?: string | null;
  userPrompt?: string | null;
  artifactPaths?: unknown;
  delegation?: unknown;
}

/** The line a finished run leaves in its project's notebook. */
export function runNotebookEntry(run: NotebookRun, status: string): string | null {
  const request = typeof run.userPrompt === 'string' ? oneLine(run.userPrompt, REQUEST_CHARS) : '';
  if (!request) return null;
  const files = Array.isArray(run.artifactPaths)
    ? (run.artifactPaths as unknown[]).filter((p): p is string => typeof p === 'string').map((p) => path.basename(p))
    : [];
  const outcome = status === 'succeeded' ? 'hecho' : status === 'canceled' ? 'detenido' : status === 'failed' ? 'falló' : status;
  const who = `${run.delegation ? 'orden de Lev → ' : ''}${run.agentId ?? 'agente'}`;
  return `${who} · «${request}» → ${outcome}${files.length ? ` · ${[...new Set(files)].slice(0, 4).join(', ')}` : ''}`;
}

/** The latest entry, read synchronously for prompt composition; null when there is none. */
export function lastNotebookEntrySync(dataDir: string, projectId: string): string | null {
  try {
    const line = lastEntries(fs.readFileSync(notebookPath(dataDir, projectId), 'utf8'), 1)[0];
    return line ? line.slice(2) : null;
  } catch {
    return null;
  }
}

/** Entries a project's own chat sees each turn; the rest are read on demand. */
export const NOTEBOOK_PROMPT_ENTRIES = 6;
const NOTEBOOK_PROMPT_CHARS = 1_400;

/** The short notebook block for a project's chat, or '' when the notebook is empty. */
export function renderNotebookPrompt(projectId: string, text: string): string {
  const entries = lastEntries(text, NOTEBOOK_PROMPT_ENTRIES);
  if (entries.length === 0) return '';
  let body = entries.join('\n');
  while (body.length > NOTEBOOK_PROMPT_CHARS && entries.length > 1) {
    entries.shift();
    body = entries.join('\n');
  }
  return [
    "## This project's notebook (latest entries)",
    '',
    body,
    '',
    `Older entries: \`"$OD_NODE_BIN" "$OD_BIN" project notebook ${projectId}\`. When the person decides something that later turns should keep, write it down: \`"$OD_NODE_BIN" "$OD_BIN" project note ${projectId} "<the decision>" --by "<your name>"\`.`,
  ].join('\n');
}
