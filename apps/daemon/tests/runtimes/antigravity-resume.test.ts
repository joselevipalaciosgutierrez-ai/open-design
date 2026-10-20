import { describe, expect, it } from 'vitest';

import { withoutResumeAfterQuestionForm, type AgentResumeContext } from '../../src/agent-session-resume.js';
import { antigravityAgentDef } from '../../src/runtimes/defs/antigravity.js';

const resuming: AgentResumeContext = {
  storedSessionId: 'f4fdd330-1278-4fcf-853a-73b3ba3789bf',
  resumeSessionId: 'f4fdd330-1278-4fcf-853a-73b3ba3789bf',
  newSessionId: 'new',
  isResuming: true,
  storedLastMessageId: 'm1',
  storedStablePromptHash: 'h',
  storedInputTokens: 100,
  storedStableSections: null,
  invalidationReason: null,
};

describe('Antigravity continues its own conversation', () => {
  it('declares capture-style resume', () => {
    expect(antigravityAgentDef.resumesSessionViaCli).toBe(true);
    expect(antigravityAgentDef.capturesSessionIdFromStream).toBe(true);
    expect(antigravityAgentDef.resumeSkipsAfterQuestionForm).toBe(true);
  });

  it('passes --conversation <id> on a follow-up turn, and nothing on a fresh one', () => {
    const resumed = antigravityAgentDef.buildArgs('p', [], [], {}, { resumeSessionId: 'abc-123-def' });
    const at = resumed.indexOf('--conversation');
    expect(at).toBeGreaterThan(-1);
    expect(resumed[at + 1]).toBe('abc-123-def');
    expect(antigravityAgentDef.buildArgs('p', [], [], {}, {})).not.toContain('--conversation');
  });

  it('refuses ids that are not agy conversation ids', () => {
    expect(antigravityAgentDef.sessionStillExists!('../../etc/passwd')).toBe(false);
    expect(antigravityAgentDef.sessionStillExists!('00000000-0000-0000-0000-000000000000')).toBe(false);
  });
});

describe('withoutResumeAfterQuestionForm', () => {
  it('sends the full transcript after a question form', () => {
    const out = withoutResumeAfterQuestionForm(resuming, 'Antes de empezar:\n<question-form id="brief">…</question-form>');
    expect(out.isResuming).toBe(false);
    expect(out.resumeSessionId).toBeNull();
  });

  it('keeps resuming after an ordinary answer', () => {
    expect(withoutResumeAfterQuestionForm(resuming, 'Listo, ya está.')).toBe(resuming);
    expect(withoutResumeAfterQuestionForm(resuming, null)).toBe(resuming);
  });
});
