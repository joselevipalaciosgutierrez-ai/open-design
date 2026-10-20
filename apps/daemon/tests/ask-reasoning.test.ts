import { describe, expect, it } from 'vitest';

import { defaultReasoningForRun } from '../src/runtimes/ask-reasoning.js';

const options = [{ id: 'default' }, { id: 'low' }, { id: 'high' }];

describe('defaultReasoningForRun', () => {
  it('starts an Ask conversation at low effort when nobody chose', () => {
    expect(defaultReasoningForRun({ chosen: null, sessionMode: 'chat', delegated: false, options })).toBe('low');
  });

  it('keeps the effort the user picked', () => {
    expect(defaultReasoningForRun({ chosen: 'high', sessionMode: 'chat', delegated: false, options })).toBe('high');
  });

  it('leaves design, plan and delegated work at the agent default', () => {
    expect(defaultReasoningForRun({ chosen: null, sessionMode: 'design', delegated: false, options })).toBeNull();
    expect(defaultReasoningForRun({ chosen: null, sessionMode: 'plan', delegated: false, options })).toBeNull();
    expect(defaultReasoningForRun({ chosen: null, sessionMode: 'chat', delegated: true, options })).toBeNull();
  });

  it('does nothing for an agent that offers no low effort', () => {
    expect(defaultReasoningForRun({ chosen: null, sessionMode: 'chat', delegated: false, options: undefined })).toBeNull();
  });
});
