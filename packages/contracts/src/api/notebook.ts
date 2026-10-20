/**
 * A project's notebook: what was done there and what was decided.
 *   GET  /api/projects/:id/notebook          → ProjectNotebookResponse
 *   PUT  /api/projects/:id/notebook          { text }  replace (the person editing it)
 *   POST /api/projects/:id/notebook/notes    { note, by? }  add a decision
 */
export interface ProjectNotebookResponse {
  projectId: string;
  /** The whole notebook, Markdown. */
  text: string;
}
