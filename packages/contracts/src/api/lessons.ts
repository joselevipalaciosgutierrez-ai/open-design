/**
 * What agents learned from their own mistakes, kept so they are not repeated.
 *   GET    /api/lessons                 → LessonsResponse
 *   POST   /api/lessons                 { rule, runId? } → LessonResponse (an agent records one)
 *   DELETE /api/lessons/:id             the person removes one (agents cannot)
 */

/**
 * Where a lesson applies. It starts in the narrowest place and widens only
 * when the same lesson recurs: in two projects it becomes the agent's, with
 * two agents it becomes everyone's.
 */
export type LessonScope = 'project' | 'agent' | 'global';

export interface Lesson {
  id: string;
  /** One short rule, in the agent's words. */
  rule: string;
  scope: LessonScope;
  /** The agent it belongs to (an agent profile id, or the CLI id for the default assistant). */
  agentKey: string;
  /** Projects where it was learned or confirmed. */
  projectIds: string[];
  /** Agents that recorded it. */
  agentKeys: string[];
  /** Times it was recorded again (1 when new). Three or more make it a standing rule. */
  confirmations: number;
  /** Runs that taught it. */
  evidenceRunIds: string[];
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
}

export interface LessonsResponse {
  lessons: Lesson[];
}

export interface LessonResponse {
  lesson: Lesson;
  /** `new`, or `confirmed` when it matched a lesson already kept. */
  outcome: 'new' | 'confirmed';
}
