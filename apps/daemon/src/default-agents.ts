import { insertAgentProfile, isDefaultSeeded, listAgentProfiles, markDefaultSeeded } from './db.js';
import { DESIGN_CRAFT_SKILL_ID } from './design-craft-delivery.js';

type Db = Parameters<typeof listAgentProfiles>[0];

const DESIGN_KEY = 'design';

export interface SeedDefaultAgentsOptions {
  /** The CLI the person chose (`agentId` in the app config); null until they have. */
  runtimeId: string | null;
  isKnownRuntime: (id: string) => boolean;
  randomId: () => string;
  now: () => number;
}

/**
 * The agent the app ships: Design, which owns the `design-craft` skill, so the design
 * rules reach the agent that designs and no other run pays for them. It is created
 * once and is an ordinary profile afterwards: the person can edit it, or delete it for
 * good (the `seeded_defaults` row stays, so it does not come back).
 *
 * Nothing is created, or marked as done, until the person has chosen a CLI to run it on.
 * An agent that already owns the skill counts as the design agent: no second one is added.
 */
export function seedDefaultAgents(db: Db, options: SeedDefaultAgentsOptions): { seeded: string[] } {
  if (isDefaultSeeded(db, DESIGN_KEY)) return { seeded: [] };
  const profiles = listAgentProfiles(db) as Array<{ skillIds?: string[] }>;
  if (profiles.some((profile) => profile.skillIds?.includes(DESIGN_CRAFT_SKILL_ID))) {
    markDefaultSeeded(db, DESIGN_KEY, options.now());
    return { seeded: [] };
  }
  const { runtimeId } = options;
  if (!runtimeId || !options.isKnownRuntime(runtimeId)) return { seeded: [] };
  const now = options.now();
  insertAgentProfile(db, {
    id: options.randomId(),
    name: 'Design',
    role: 'Designs and polishes interfaces',
    emoji: '🎨',
    runtimeId,
    model: null,
    instructions:
      'Before you design, restyle or polish anything, read your `design-craft` skill and follow it. '
      + "The project's design system and the brief come first; the skill holds the craft rules.",
    skillIds: [DESIGN_CRAFT_SKILL_ID],
    designSystemId: null,
    card: {
      goodFor:
        "Designing, restyling and polishing interfaces: landing pages, prototypes, dashboards, decks. Applies the project's design system and the design rules in its skill.",
      notFor: 'Backend code, data work, tests or deployment.',
      delivers: 'HTML files in the project folder and a short note on the design decisions.',
    },
    createdAt: now,
    updatedAt: now,
  });
  markDefaultSeeded(db, DESIGN_KEY, now);
  return { seeded: [DESIGN_KEY] };
}
