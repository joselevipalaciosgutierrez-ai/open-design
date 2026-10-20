import { describe, expect, it } from 'vitest';

import { askModeSkillCard } from '../../src/prompts/skill-card.js';
import { composeSystemPrompt } from '../../src/prompts/system.js';

const BODY = [
  '> **Skill root (relative to project):** `.od-skills/web-prototype-29f7/`',
  '> **Skill root (absolute fallback):** `/opt/od/skills/web-prototype`',
  '',
  '# Web Prototype',
  'WORKFLOW-STEP-ONE: read assets/template.html first.',
].join('\n');

describe('askModeSkillCard', () => {
  it('points at SKILL.md instead of carrying the workflow', () => {
    const card = askModeSkillCard('Web Prototype', BODY)!;
    expect(card).toContain('## Active skill — Web Prototype (on demand)');
    expect(card).toContain('`.od-skills/web-prototype-29f7/SKILL.md`');
    expect(card).toContain('`/opt/od/skills/web-prototype/SKILL.md`');
    expect(card).not.toContain('WORKFLOW-STEP-ONE');
  });

  it('gives up when there is no path to point at', () => {
    expect(askModeSkillCard('Tiny', '# Tiny\nDo this.')).toBeNull();
  });
});

describe('the active skill in the composed prompt', () => {
  it('is a card in Ask mode', () => {
    const prompt = composeSystemPrompt({ sessionMode: 'chat', skillName: 'Web Prototype', skillBody: BODY });
    expect(prompt).toContain('(on demand)');
    expect(prompt).not.toContain('WORKFLOW-STEP-ONE');
  });

  it('is the whole workflow in Design mode', () => {
    const prompt = composeSystemPrompt({ sessionMode: 'design', skillName: 'Web Prototype', skillBody: BODY });
    expect(prompt).toContain('WORKFLOW-STEP-ONE');
    expect(prompt).not.toContain('(on demand)');
  });

  it('stays whole in Ask mode for a short skill with no path', () => {
    const prompt = composeSystemPrompt({ sessionMode: 'chat', skillName: 'Tiny', skillBody: '# Tiny\nTINY-RULE.' });
    expect(prompt).toContain('TINY-RULE');
  });
});
