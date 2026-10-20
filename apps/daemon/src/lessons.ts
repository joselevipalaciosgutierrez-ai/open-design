/**
 * Lessons: what agents learned from their own mistakes, so they do not repeat
 * them. Agents record them on their own (`od lesson add`); the protections
 * against the known failure modes of self-learning agents live here, in code:
 *
 * - Narrow first. A lesson starts for one project and one agent. It widens to
 *   the agent everywhere only when it recurs in two projects, and to every
 *   agent only when two agents record it. A rule that was right in one place
 *   is not assumed to be right everywhere (the "locally correct but
 *   non-transferable" poisoning).
 * - No duplicates. A lesson that matches one already kept confirms it instead
 *   of adding a copy (agents tend to write the same lesson again and again).
 * - Confirmed lessons become standing rules. Three confirmations and it goes
 *   into every relevant turn, not only when the message happens to match:
 *   recording a lesson is not the same as applying it.
 * - A ceiling and forgetting. At most a few lessons reach a turn, and one not
 *   used or confirmed in 60 days is dropped.
 *
 * Plain JSON in the daemon's data (`<dataDir>/lessons.json`); the person sees
 * and removes them in Settings and with `od lesson`.
 */
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

import type { Lesson } from '@open-design/contracts';

export const LESSON_RULE_MAX_CHARS = 240;
export const LESSONS_MAX_KEPT = 300;
export const LESSON_STANDING_CONFIRMATIONS = 3;
export const LESSON_FORGET_AFTER_MS = 60 * 24 * 60 * 60 * 1000;
/** Lessons that reach one turn, in total. */
export const LESSONS_PER_TURN = 6;
const SIMILAR = 0.6;

export function lessonsPath(dataDir: string): string {
  return path.join(dataDir, 'lessons.json');
}

export async function readLessons(dataDir: string): Promise<Lesson[]> {
  try {
    const parsed = JSON.parse(await fsp.readFile(lessonsPath(dataDir), 'utf8')) as { lessons?: Lesson[] };
    return Array.isArray(parsed.lessons) ? parsed.lessons : [];
  } catch {
    return [];
  }
}

export async function writeLessons(dataDir: string, lessons: Lesson[]): Promise<void> {
  const file = lessonsPath(dataDir);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify({ lessons }, null, 2), 'utf8');
  await fsp.rename(tmp, file);
}

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2),
  );
}

/** How alike two rules are (shared words over all words). */
export function similarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  return shared / (wa.size + wb.size - shared);
}

/** The scope a lesson has earned from where it was recorded. */
export function earnedScope(lesson: Pick<Lesson, 'projectIds' | 'agentKeys'>): Lesson['scope'] {
  if (new Set(lesson.agentKeys).size >= 2) return 'global';
  if (new Set(lesson.projectIds).size >= 2) return 'agent';
  return 'project';
}

export interface RecordLessonInput {
  rule: string;
  agentKey: string;
  projectId: string | null;
  runId?: string | null;
  now?: number;
}

/**
 * Adds a lesson, or confirms the one it matches (same agent, or any agent when
 * the kept one is already shared). Returns the new list and what happened.
 */
export function recordLesson(lessons: Lesson[], input: RecordLessonInput): { lessons: Lesson[]; lesson: Lesson; outcome: 'new' | 'confirmed' } {
  const rule = input.rule.replace(/\s+/g, ' ').trim().slice(0, LESSON_RULE_MAX_CHARS);
  if (!rule) throw new Error('the lesson is empty');
  const now = input.now ?? Date.now();
  const match = lessons
    .map((lesson) => ({ lesson, score: similarity(lesson.rule, rule) }))
    .filter(({ score }) => score >= SIMILAR)
    .sort((a, b) => b.score - a.score)[0]?.lesson;
  if (match) {
    const updated: Lesson = {
      ...match,
      confirmations: match.confirmations + 1,
      projectIds: input.projectId && !match.projectIds.includes(input.projectId) ? [...match.projectIds, input.projectId] : match.projectIds,
      agentKeys: match.agentKeys.includes(input.agentKey) ? match.agentKeys : [...match.agentKeys, input.agentKey],
      evidenceRunIds: input.runId ? [...match.evidenceRunIds, input.runId].slice(-10) : match.evidenceRunIds,
      updatedAt: now,
    };
    updated.scope = earnedScope(updated);
    return { lessons: lessons.map((l) => (l.id === match.id ? updated : l)), lesson: updated, outcome: 'confirmed' };
  }
  const lesson: Lesson = {
    id: randomUUID(),
    rule,
    scope: 'project',
    agentKey: input.agentKey,
    projectIds: input.projectId ? [input.projectId] : [],
    agentKeys: [input.agentKey],
    confirmations: 1,
    evidenceRunIds: input.runId ? [input.runId] : [],
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
  };
  // A lesson recorded outside any project already applies to the whole agent.
  if (!input.projectId) lesson.scope = 'agent';
  const kept = [...lessons, lesson];
  return { lessons: kept.slice(-LESSONS_MAX_KEPT), lesson, outcome: 'new' };
}

/** Drops lessons neither used nor confirmed for too long. */
export function forgetStale(lessons: Lesson[], now = Date.now()): Lesson[] {
  // A standing rule is applied every relevant turn, so it is kept until the
  // person removes it.
  return lessons.filter(
    (lesson) =>
      lesson.confirmations >= LESSON_STANDING_CONFIRMATIONS
      || now - Math.max(lesson.updatedAt, lesson.lastUsedAt ?? 0) < LESSON_FORGET_AFTER_MS,
  );
}

/** The line a turn gets when this conversation's previous attempt failed. */
export function renderPreviousFailureNudge(error: string | null): string {
  const what = error ? ` (${error.replace(/\s+/g, ' ').trim().slice(0, 160)})` : '';
  return `The previous attempt in this conversation failed${what}. If this turn finds what fixes it, record the lesson before you finish: \`"$OD_NODE_BIN" "$OD_BIN" lesson add "<one short rule>"\`.`;
}

/** Whether a lesson applies to this agent in this project. */
export function appliesTo(lesson: Lesson, agentKey: string, projectId: string | null): boolean {
  if (lesson.scope === 'global') return true;
  if (!lesson.agentKeys.includes(agentKey)) return false;
  if (lesson.scope === 'agent') return true;
  return !!projectId && lesson.projectIds.includes(projectId);
}

/**
 * The lessons for one turn: standing rules first (confirmed enough to apply
 * always), then the ones whose words meet the message, at most
 * LESSONS_PER_TURN.
 */
export function lessonsForTurn(lessons: Lesson[], agentKey: string, projectId: string | null, message: string): Lesson[] {
  const applicable = lessons.filter((lesson) => appliesTo(lesson, agentKey, projectId));
  const standing = applicable
    .filter((lesson) => lesson.confirmations >= LESSON_STANDING_CONFIRMATIONS)
    .sort((a, b) => b.confirmations - a.confirmations);
  const messageWords = words(message);
  const relevant = applicable
    .filter((lesson) => lesson.confirmations < LESSON_STANDING_CONFIRMATIONS)
    .map((lesson) => {
      const lessonWords = words(lesson.rule);
      let shared = 0;
      for (const w of lessonWords) if (messageWords.has(w)) shared += 1;
      // Lessons of this very project come along even without shared words.
      const local = projectId && lesson.scope === 'project' ? 0.5 : 0;
      return { lesson, score: shared + local };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.lesson.updatedAt - a.lesson.updatedAt)
    .map(({ lesson }) => lesson);
  return [...standing, ...relevant].slice(0, LESSONS_PER_TURN);
}

export function renderLessonsPrompt(lessons: Lesson[]): string {
  if (lessons.length === 0) return '';
  return [
    '## Lessons from earlier work (follow them)',
    '',
    ...lessons.map((lesson) => `- ${lesson.rule}`),
  ].join('\n');
}
