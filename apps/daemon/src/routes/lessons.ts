import type { Express } from 'express';

import type { LessonResponse, LessonsResponse } from '@open-design/contracts';

import { getConversation } from '../db.js';
import { forgetStale, readLessons, recordLesson, writeLessons } from '../lessons.js';
import type { RouteDeps } from '../server-context.js';

type Db = Parameters<typeof getConversation>[0];

export interface LessonRunFacts {
  projectId?: string | null;
  conversationId?: string | null;
  agentId?: string | null;
}

export interface RegisterLessonRoutesDeps extends RouteDeps<'http'> {
  db: Db;
  dataDir: string;
  getRun: (runId: string) => LessonRunFacts | null | undefined;
  /** Lev's space: its lessons apply to Lev everywhere, not to a project. */
  orchestratorProjectId: () => string | null;
}

/** The agent a run speaks as: its agent profile, else the CLI it runs on. */
export function lessonAgentKey(db: Db, run: LessonRunFacts): string {
  const profileId = run.conversationId ? (getConversation(db, run.conversationId) as { agentProfileId?: string | null } | null)?.agentProfileId : null;
  return profileId || run.agentId || 'agent';
}

/**
 * Lessons (lessons.ts):
 *   GET    /api/lessons
 *   POST   /api/lessons        { rule, runId? }  an agent records what it learned
 *   DELETE /api/lessons/:id    the person removes one; the agent gateway refuses it
 */
export function registerLessonRoutes(app: Express, ctx: RegisterLessonRoutesDeps) {
  const { sendApiError } = ctx.http;
  // One write at a time: two agents finishing together must not lose a lesson.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  };

  app.get('/api/lessons', async (_req, res) => {
    const lessons = await serial(async () => {
      const all = await readLessons(ctx.dataDir);
      const kept = forgetStale(all);
      if (kept.length !== all.length) await writeLessons(ctx.dataDir, kept);
      return kept;
    });
    const body: LessonsResponse = { lessons: [...lessons].sort((a, b) => b.updatedAt - a.updatedAt) };
    res.json(body);
  });

  app.post('/api/lessons', async (req, res) => {
    const { rule, runId } = (req.body ?? {}) as { rule?: unknown; runId?: unknown };
    if (typeof rule !== 'string' || !rule.trim()) return sendApiError(res, 400, 'BAD_REQUEST', 'rule (string) is required');
    const run = typeof runId === 'string' && runId ? ctx.getRun(runId) : null;
    const levProject = ctx.orchestratorProjectId();
    const projectId = run?.projectId && run.projectId !== levProject ? run.projectId : null;
    const agentKey = run ? lessonAgentKey(ctx.db, run) : 'person';
    try {
      const result = await serial(async () => {
        const recorded = recordLesson(forgetStale(await readLessons(ctx.dataDir)), {
          rule,
          agentKey,
          projectId,
          runId: typeof runId === 'string' ? runId : null,
        });
        await writeLessons(ctx.dataDir, recorded.lessons);
        return recorded;
      });
      const body: LessonResponse = { lesson: result.lesson, outcome: result.outcome };
      res.status(result.outcome === 'new' ? 201 : 200).json(body);
    } catch (error) {
      sendApiError(res, 400, 'BAD_REQUEST', error instanceof Error ? error.message : String(error));
    }
  });

  app.delete('/api/lessons/:id', async (req, res) => {
    const removed = await serial(async () => {
      const all = await readLessons(ctx.dataDir);
      const kept = all.filter((lesson) => lesson.id !== req.params.id);
      if (kept.length === all.length) return false;
      await writeLessons(ctx.dataDir, kept);
      return true;
    });
    if (!removed) return sendApiError(res, 404, 'NOT_FOUND', 'lesson not found');
    res.json({ deleted: req.params.id });
  });
}
