import { describe, expect, it } from 'vitest';

import { renderAgentMacRules } from '../src/server.js';

const facts = { readWholeMac: true, macControl: true, accessibility: true, allowedDirs: [] as string[] };

describe('renderAgentMacRules', () => {
  it('tells the agent it may read the whole Mac and must act when Mac control is on', () => {
    const text = renderAgentMacRules(facts).join('\n');
    expect(text).toContain('READ files anywhere on this Mac');
    expect(text).toContain('Mac control is ON');
    expect(text).toContain('mac screenshot');
    expect(text).not.toContain('Accessibility permission');
  });

  it('names the missing macOS permission instead of claiming the agent cannot act', () => {
    const text = renderAgentMacRules({ ...facts, accessibility: false }).join('\n');
    expect(text).toContain('Accessibility');
    expect(text).toContain('opening apps works');
  });

  it('sends the person to Settings when Mac control is off', () => {
    const text = renderAgentMacRules({ ...facts, readWholeMac: false, macControl: false }).join('\n');
    expect(text).toContain('Mac control is OFF');
    expect(text).toContain('read only this project');
  });
});
