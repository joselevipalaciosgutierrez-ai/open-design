import type { ProjectFile, RunDelegate } from '@open-design/contracts';
import type { AgentEvent } from '../../types';
import { latestTodoWriteInputFromMessages, parseTodoWriteInput } from '../todos';
import { buildActivitySteps } from './activity-steps';

/**
 * What the Ask conversation's status panel shows, as plain data. Three sections,
 * each present only when it has something to say: a section with nothing in it
 * is left out, not drawn empty (see the degradation rule in
 * `components/chat/AGENTS.md`).
 */

export type TaskMark = 'done' | 'running' | 'pending' | 'stopped';

export interface StatusTask {
  content: string;
  mark: TaskMark;
}

export interface StatusBackgroundItem {
  runId: string;
  conversationId: string | null;
  agent: { id: string; name: string; emoji: string | null } | null;
  status: RunDelegate['status'];
  createdAt: number;
  terminalAt: number | null;
}

export interface StatusChange {
  name: string;
  kind: ProjectFile['kind'];
  mtime: number;
}

export interface StatusPanelState {
  tasks: { items: StatusTask[]; completed: number; total: number } | null;
  background: { running: StatusBackgroundItem[]; finished: StatusBackgroundItem[] } | null;
  changes: { files: StatusChange[]; count: number } | null;
  /** True when there is nothing to show, so the panel does not take up the column. */
  isEmpty: boolean;
}

/** Most files listed; the count above it still says how many there are. */
export const MAX_LISTED_CHANGES = 50;

const RUNNING = new Set(['queued', 'running']);

function markOf(status: string): TaskMark {
  if (status === 'completed') return 'done';
  if (status === 'in_progress') return 'running';
  if (status === 'stopped') return 'stopped';
  return 'pending';
}

/** Files that are the project's own work, not host plumbing or folders. */
function isUserVisibleChange(file: ProjectFile): boolean {
  if (file.type === 'dir') return false;
  const segments = file.name.split('/');
  return !segments.some((segment) => segment.startsWith('.') || segment === 'node_modules');
}

export function buildStatusPanelState(input: {
  /** The conversation's messages, for the assistant's latest plan. */
  messages: ReadonlyArray<{ role: string; events?: AgentEvent[] | undefined; runStatus?: string | undefined }> | undefined;
  /** App locale, for the wording of steps derived from tool calls. */
  locale?: string;
  /** Runs the orchestrator started from this conversation's turns. */
  delegates: readonly RunDelegate[];
  files: readonly ProjectFile[];
  /** Files changed before this are not this conversation's changes. */
  since: number;
}): StatusPanelState {
  const todos = parseTodoWriteInput(latestTodoWriteInputFromMessages(input.messages));
  const planned: StatusTask[] = todos.map((todo) => ({ content: todo.content, mark: markOf(todo.status) }));
  // An agent that writes no plan still shows what it did, one step per tool call.
  const steps = planned.length > 0 ? planned : buildActivitySteps({ messages: input.messages, locale: input.locale ?? 'en' });
  const tasks =
    steps.length === 0
      ? null
      : { items: steps, completed: steps.filter((task) => task.mark === 'done').length, total: steps.length };

  const items: StatusBackgroundItem[] = [...input.delegates]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((d) => ({
      runId: d.runId,
      conversationId: d.conversationId,
      agent: d.agent,
      status: d.status,
      createdAt: d.createdAt,
      terminalAt: d.terminalAt,
    }));
  const running = items.filter((item) => RUNNING.has(item.status));
  const finished = items.filter((item) => !RUNNING.has(item.status));
  const background = items.length === 0 ? null : { running, finished };

  const changed = input.files
    .filter((file) => isUserVisibleChange(file) && file.mtime >= input.since)
    .sort((a, b) => b.mtime - a.mtime);
  const changes =
    changed.length === 0
      ? null
      : {
          count: changed.length,
          files: changed
            .slice(0, MAX_LISTED_CHANGES)
            .map((file) => ({ name: file.name, kind: file.kind, mtime: file.mtime })),
        };

  return { tasks, background, changes, isEmpty: !tasks && !background && !changes };
}

/** "42s", "3 min", "2 h": how long something has been going, coarse on purpose. */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h`;
}
