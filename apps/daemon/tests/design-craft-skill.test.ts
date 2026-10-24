import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { listSkills } from '../src/skills.js';
import {
  DESIGN_CRAFT_SKILL_ID,
  designCraftAvailableToRun,
  effectiveDesignCraftDelivery,
} from '../src/design-craft-delivery.js';

const SKILLS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../skills');

describe('design-craft skill', () => {
  it('is discovered from skills/ under the id the charter digest points at', async () => {
    const skills = await listSkills(SKILLS_DIR);
    const found = skills.find((skill) => skill.id === DESIGN_CRAFT_SKILL_ID);
    expect(found, 'skills/design-craft must be discoverable').toBeDefined();
    expect(found!.description).toMatch(/design/i);
  });
});

describe('designCraftAvailableToRun', () => {
  const owner = { skillIds: [DESIGN_CRAFT_SKILL_ID] };
  const other = { skillIds: ['animate'] };

  it('an agent has it only when it owns it (or the person made it global)', () => {
    expect(designCraftAvailableToRun({ agentSkillIds: [DESIGN_CRAFT_SKILL_ID], globalIds: [], profiles: [owner] })).toBe(true);
    expect(designCraftAvailableToRun({ agentSkillIds: [], globalIds: [], profiles: [owner] })).toBe(false);
    expect(designCraftAvailableToRun({ agentSkillIds: [], globalIds: [DESIGN_CRAFT_SKILL_ID], profiles: [owner] })).toBe(true);
  });

  it('a development agent does not get it even when there is no design agent at all', () => {
    expect(designCraftAvailableToRun({ agentSkillIds: [], globalIds: [], profiles: [] })).toBe(false);
    expect(designCraftAvailableToRun({ agentSkillIds: ['x'], globalIds: [], profiles: [other] })).toBe(false);
  });

  it('the default assistant delegates design to the design agent, so it does not carry the skill', () => {
    expect(designCraftAvailableToRun({ agentSkillIds: null, globalIds: [], profiles: [owner, other] })).toBe(false);
  });

  it('without a design agent the default assistant designs itself, with the skill', () => {
    expect(designCraftAvailableToRun({ agentSkillIds: null, globalIds: [], profiles: [] })).toBe(true);
    expect(designCraftAvailableToRun({ agentSkillIds: null, globalIds: [], profiles: [other] })).toBe(true);
  });
});

describe('effectiveDesignCraftDelivery', () => {
  const present = [{ id: DESIGN_CRAFT_SKILL_ID }];

  it('points at the skill when the run has it', () => {
    expect(effectiveDesignCraftDelivery(present, true, 'pull')).toBe('pull');
  });

  it('keeps only the hard rules when the run does not have the skill', () => {
    expect(effectiveDesignCraftDelivery(present, false, 'pull')).toBe('digest');
  });

  it('puts the whole rulebook back when the skill does not exist or inline is forced', () => {
    expect(effectiveDesignCraftDelivery([{ id: 'animate' }], true, 'pull')).toBe('inline');
    expect(effectiveDesignCraftDelivery(present, true, 'inline')).toBe('inline');
  });
});
