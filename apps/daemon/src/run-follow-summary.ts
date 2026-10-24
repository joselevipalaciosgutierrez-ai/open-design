/**
 * What `od run start --follow` hands back to a run that delegated, instead of
 * every event of the delegated run.
 *
 * The full stream is mostly tool output (about two thirds in a measured run) and
 * the delegating agent only needs the outcome: whether it worked, what the agent
 * said last, which files it made, what it cost, and why it failed. Everything
 * else stays one command away (`od run watch <id>`).
 */

export interface FollowEvent {
  event: string;
  data: unknown;
}

/** Tail of the agent's own words kept in the summary. */
const MAX_MESSAGE_CHARS = 2_000;
const MAX_FILES = 12;
const MAX_ERROR_CHARS = 300;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** `<od-done key="…"/>` and the like are for the host, not for the delegating agent. */
function stripHostMarkers(text: string): string {
  return text.replace(/<od-[a-z-]+\b[^>]*\/>/g, '');
}

/** The last `max` characters, starting at a line or sentence rather than mid-word. */
function tailAtBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(-max);
  const boundary = cut.search(/\n|(?<=[.!?])\s/);
  const from = boundary >= 0 && boundary < max / 2 ? boundary + 1 : 0;
  return `…${cut.slice(from).trimStart()}`;
}

export interface RunFollowSummary {
  add(event: FollowEvent): void;
  render(): string;
}

export function createRunFollowSummary(runId: string): RunFollowSummary {
  let message = '';
  let error = '';
  let usage: { input?: number; output?: number; cached?: number } | null = null;
  let end: Record<string, unknown> | null = null;
  let lastRunId = runId;
  let toolSinceText = false;

  return {
    add({ event, data }) {
      const record = asRecord(data);
      if (event === 'start' && typeof record?.runId === 'string') lastRunId = record.runId;
      if (event === 'error') {
        const text = typeof record?.message === 'string' ? record.message : typeof data === 'string' ? data : '';
        if (text) error = text.slice(0, MAX_ERROR_CHARS);
      }
      if (event === 'end' && record) end = record;
      if (event !== 'agent' || !record) return;
      // The agent's last turn is what it reports: when words come back after
      // tool calls they start the message over. If no words follow the last
      // tool call, what it said before still stands.
      if (record.type === 'tool_use' || record.type === 'tool_result') toolSinceText = true;
      if (record.type === 'text_delta' && typeof record.delta === 'string') {
        if (toolSinceText) message = '';
        toolSinceText = false;
        message = (message + record.delta).slice(-MAX_MESSAGE_CHARS * 2);
      }
      const used = asRecord(record.usage);
      if (record.type === 'usage' && used) {
        const input = used.input_tokens;
        const output = used.output_tokens;
        const cached = used.cache_read_input_tokens;
        usage = {
          ...(typeof input === 'number' ? { input } : {}),
          ...(typeof output === 'number' ? { output } : {}),
          ...(typeof cached === 'number' && cached > 0 ? { cached } : {}),
        };
      }
    },

    render() {
      const lines: string[] = [];
      if (!end) {
        lines.push(`[run] ${lastRunId} ended without an end event; it may still be running or may have been cut off.`);
      } else {
        const status = typeof end.status === 'string' ? end.status : 'unknown';
        const code = typeof end.code === 'number' ? ` (exit ${end.code})` : '';
        lines.push(`[run] ${lastRunId} finished: ${status}${code}`);
      }
      const finalMessage = tailAtBoundary(stripHostMarkers(message).trim(), MAX_MESSAGE_CHARS);
      if (finalMessage) lines.push('Final message:', finalMessage);
      const files = Array.isArray(end?.artifactPaths)
        ? (end!.artifactPaths as unknown[]).filter((p): p is string => typeof p === 'string')
        : [];
      if (files.length > 0) {
        const shown = files.slice(0, MAX_FILES).join(', ');
        lines.push(`Files: ${shown}${files.length > MAX_FILES ? ` (+${files.length - MAX_FILES} more)` : ''}`);
      }
      if (end?.status === 'failed' || error) {
        const reason = [end?.failureCategory, end?.failureDetail].filter((v) => typeof v === 'string').join('/');
        lines.push(`Error: ${error || 'no message'}${reason ? ` [${reason}]` : ''}`);
        if (end?.retryable === false) lines.push('Not retryable as it is: do not retry the same agent, fix the cause or use another.');
      }
      if (usage && (usage.input !== undefined || usage.output !== undefined)) {
        lines.push(
          `Tokens: input ${usage.input ?? '?'}${usage.cached !== undefined ? ` (cached ${usage.cached})` : ''}, output ${usage.output ?? '?'}`,
        );
      }
      lines.push(`Full event stream: od run watch ${lastRunId}`);
      return lines.join('\n');
    },
  };
}
