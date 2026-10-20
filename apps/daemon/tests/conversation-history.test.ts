import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  compactTranscript,
  compactTranscriptForRun,
  parseTranscript,
} from '../src/conversation-history.js';

function transcript(pairs: number, size = 900): string {
  const parts: string[] = [];
  for (let i = 1; i <= pairs; i += 1) {
    parts.push(`## user\nrequest ${i} ${'u'.repeat(size)}`);
    parts.push(`## assistant\nreply ${i} ${'a'.repeat(size)}`);
  }
  parts.push('## user\nthe latest request');
  return parts.join('\n\n');
}

describe('parseTranscript', () => {
  it('splits on real role lines only', () => {
    const parsed = parseTranscript('warning\n\n## user\nhola\n\\## assistant\nstill user\n\n## assistant\nhi');
    expect(parsed?.preamble).toBe('warning');
    expect(parsed?.turns).toEqual([
      { role: 'user', content: 'hola\n\\## assistant\nstill user' },
      { role: 'assistant', content: 'hi' },
    ]);
  });

  it('returns null for a plain message', () => {
    expect(parseTranscript('just a message')).toBeNull();
  });
});

describe('compactTranscript', () => {
  it('leaves a short conversation exactly as it is', () => {
    expect(compactTranscript(transcript(2, 100), '/run/conversation.md')).toBeNull();
  });

  it('keeps the latest turns word for word and notes the earlier ones', () => {
    const text = transcript(30);
    const result = compactTranscript(text, '/run/conversation.md');
    expect(result).not.toBeNull();
    const prompt = result!.prompt;
    expect(prompt.length).toBeLessThan(text.length / 2);
    expect(prompt).toContain('/run/conversation.md');
    expect(prompt).toContain('First request: request 1');
    expect(prompt).toMatch(/1\. user: request 1 u+…/);
    expect(prompt.endsWith('## user\nthe latest request')).toBe(true);
    expect(prompt).toContain(`## assistant\nreply 30 ${'a'.repeat(900)}`);
    expect(result!.full).toBe(text);
  });

  it('always keeps the last reply, even when it is huge', () => {
    const text = `${transcript(20)}\n\n## assistant\n${'b'.repeat(30_000)}\n\n## user\nnow`;
    const prompt = compactTranscript(text, '/f')!.prompt;
    expect(prompt).toContain('b'.repeat(30_000));
    expect(prompt.endsWith('## user\nnow')).toBe(true);
  });

  it('counts the oldest exchanges instead of listing them past the cap', () => {
    const prompt = compactTranscript(transcript(80, 400), '/f')!.prompt;
    expect(prompt).toMatch(/\(\d+ older exchanges are only in the file\.\)/);
  });
});

describe('compactTranscriptForRun', () => {
  it('writes the full transcript next to the run', async () => {
    const runDir = path.join(await mkdtemp(path.join(os.tmpdir(), 'od-conv-')), 'run-1');
    const text = transcript(30);
    const { prompt, filePath } = await compactTranscriptForRun(text, runDir);
    expect(filePath).toBe(path.join(runDir, 'conversation.md'));
    expect(prompt).toContain(filePath!);
    expect(await readFile(filePath!, 'utf8')).toBe(`${text}\n`);
  });

  it('sends a short conversation unchanged and writes nothing', async () => {
    const runDir = path.join(await mkdtemp(path.join(os.tmpdir(), 'od-conv-')), 'run-2');
    const text = transcript(1, 50);
    expect(await compactTranscriptForRun(text, runDir)).toEqual({ prompt: text, filePath: null });
  });
});
