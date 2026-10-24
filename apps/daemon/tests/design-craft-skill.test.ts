import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { listSkills } from '../src/skills.js';
import { prepareRunSkills } from '../src/agent-access/run-skills.js';
import { DESIGN_CRAFT_SKILL_ID, effectiveDesignCraftDelivery } from '../src/design-craft-delivery.js';

const SKILLS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../skills');

describe('design-craft skill', () => {
  it('is discovered from skills/ under the id the charter digest points at', async () => {
    const skills = await listSkills(SKILLS_DIR);
    const found = skills.find((skill) => skill.id === DESIGN_CRAFT_SKILL_ID);
    expect(found, 'skills/design-craft must be discoverable').toBeDefined();
    expect(found!.description).toMatch(/design/i);
  });

  it('is listed first in the run index even when the user has many global skills', async () => {
    const skills = await listSkills(SKILLS_DIR);
    const library = skills
      .filter((skill) => typeof skill.dir === 'string' && skill.dir)
      .map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        triggers: skill.triggers,
        dir: skill.dir as string,
      }));
    const others = library.filter((skill) => skill.id !== DESIGN_CRAFT_SKILL_ID).slice(0, 12).map((s) => s.id);
    const copied: string[] = [];
    const result = await prepareRunSkills({
      globalIds: [DESIGN_CRAFT_SKILL_ID, ...others],
      agentIds: [],
      activeIds: [],
      library,
      message: 'make a landing page',
      runDir: '/tmp/od-design-craft-test-run',
      copy: async (from) => {
        copied.push(from);
      },
    });
    expect(result.listedIds[0]).toBe(DESIGN_CRAFT_SKILL_ID);
    expect(result.indexPrompt).toContain('design-craft');
  });
});

describe('effectiveDesignCraftDelivery', () => {
  it('falls back to inline when the skill was deleted', () => {
    expect(effectiveDesignCraftDelivery([{ id: 'animate' }], 'pull')).toBe('inline');
    expect(effectiveDesignCraftDelivery([{ id: DESIGN_CRAFT_SKILL_ID }], 'pull')).toBe('pull');
    expect(effectiveDesignCraftDelivery([{ id: DESIGN_CRAFT_SKILL_ID }], 'inline')).toBe('inline');
  });
});
