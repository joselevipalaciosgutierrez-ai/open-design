import { describe, expect, it } from 'vitest';

import { createRunFollowSummary } from '../src/run-follow-summary.js';

const text = (delta: string) => ({ event: 'agent', data: { type: 'text_delta', delta } });
const toolResult = (size: number) => ({
  event: 'agent',
  data: { type: 'tool_result', content: 'x'.repeat(size) },
});

describe('run follow summary', () => {
  it('reports status, the final message, files and tokens in a few lines', () => {
    const summary = createRunFollowSummary('run-1');
    summary.add({ event: 'start', data: { runId: 'run-1' } });
    summary.add(text('Built the page. '));
    for (let i = 0; i < 40; i += 1) summary.add(toolResult(2_000));
    summary.add(text('It lives in index.html.'));
    summary.add({
      event: 'agent',
      data: { type: 'usage', usage: { input_tokens: 1200, output_tokens: 340 } },
    });
    summary.add({
      event: 'end',
      data: { status: 'succeeded', code: 0, artifactPaths: ['index.html', 'styles.css'] },
    });
    const out = summary.render();
    expect(out).toContain('succeeded');
    expect(out).toContain('run-1');
    // Words before the tool calls are narration; the last turn is the report.
    expect(out).toContain('It lives in index.html.');
    expect(out).not.toContain('Built the page.');
    expect(out).toContain('index.html, styles.css');
    expect(out).toContain('1200');
    expect(out).toContain('340');
    expect(out).toContain('od run watch run-1');
    // 80KB of tool output never reaches the summary.
    expect(out.length).toBeLessThan(1_200);
  });

  it('keeps only the tail of a very long final message', () => {
    const summary = createRunFollowSummary('r');
    summary.add(text(`${'a'.repeat(5_000)}THE-END`));
    summary.add({ event: 'end', data: { status: 'succeeded' } });
    const out = summary.render();
    expect(out).toContain('THE-END');
    expect(out.length).toBeLessThan(2_600);
  });

  it('says why a run failed and whether trying again can help', () => {
    const summary = createRunFollowSummary('r');
    summary.add({ event: 'error', data: { message: 'Claude Code could not authenticate.' } });
    summary.add({
      event: 'end',
      data: { status: 'failed', failureCategory: 'auth', failureDetail: 'auth_required', retryable: false },
    });
    const out = summary.render();
    expect(out).toContain('failed');
    expect(out).toContain('could not authenticate');
    expect(out).toContain('auth');
    expect(out).toMatch(/not retryable|do not retry/i);
  });

  it('still reports something when the stream ends without an end event', () => {
    const summary = createRunFollowSummary('r');
    summary.add(text('partial'));
    expect(summary.render()).toMatch(/no end event|ended without/i);
  });

  it('keeps the last turn only, without the host marker or a sentence cut in half', () => {
    const summary = createRunFollowSummary('r');
    summary.add(text('Let me check the file first.'));
    summary.add({ event: 'agent', data: { type: 'tool_use', name: 'Read' } });
    summary.add(toolResult(100));
    summary.add(text(`${'Detail line. '.repeat(300)}\n\nThe page is in index.html.<od-done key="abc123"/>`));
    summary.add({ event: 'end', data: { status: 'succeeded' } });
    const out = summary.render();
    expect(out).not.toContain('Let me check the file first');
    expect(out).not.toContain('od-done');
    expect(out).toContain('The page is in index.html.');
    const body = out.split('Final message:\n')[1]!.split('\n')[0]!;
    expect(body.startsWith('…') || body.startsWith('Detail')).toBe(true);
  });

  it('shows cached tokens apart from fresh ones', () => {
    const summary = createRunFollowSummary('r');
    summary.add({
      event: 'agent',
      data: {
        type: 'usage',
        usage: { input_tokens: 8, output_tokens: 13229, cache_read_input_tokens: 41000 },
      },
    });
    summary.add({ event: 'end', data: { status: 'succeeded' } });
    expect(summary.render()).toContain('cached 41000');
  });
});
