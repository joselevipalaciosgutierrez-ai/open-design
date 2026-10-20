import { describe, expect, it } from 'vitest';

import { basicDraft, parseDraftReply, suggestSkillsFor } from '../src/agent-draft.js';

const library = [
  { id: 'market-research', name: 'market-research', description: 'Competitor and market analysis reports' },
  { id: 'framer', name: 'framer', description: 'Build sites in Framer' },
  { id: 'deck', name: 'deck', description: 'Slide decks' },
];

describe('suggestSkillsFor', () => {
  it('suggests the library skills the description is about, leaving out global ones', () => {
    expect(suggestSkillsFor('researches the market and competitor landscape', library, [])).toEqual(['market-research']);
    expect(suggestSkillsFor('builds sites in framer', library, ['framer'])).toEqual([]);
  });
});

describe('parseDraftReply', () => {
  it('reads the JSON the model was asked for, even with text around it', () => {
    const draft = parseDraftReply('Here it is:\n{"emoji":"📊","role":"Market researcher","goodFor":"competitor analysis, pricing","notFor":"visual design","delivers":"a Markdown report","instructions":"Cite sources."}');
    expect(draft).toEqual({
      emoji: '📊',
      role: 'Market researcher',
      instructions: 'Cite sources.',
      card: { goodFor: 'competitor analysis, pricing', notFor: 'visual design', delivers: 'a Markdown report' },
    });
  });

  it('refuses a reply without the essentials', () => {
    expect(parseDraftReply('{"emoji":"x"}')).toBeNull();
    expect(parseDraftReply(null)).toBeNull();
    expect(parseDraftReply('no json')).toBeNull();
  });
});

describe('basicDraft', () => {
  it('fills the basics from the sentence when no model is available', () => {
    expect(basicDraft('Investiga el mercado. Entrega informes.')).toMatchObject({
      role: 'Investiga el mercado',
      card: { goodFor: 'Investiga el mercado. Entrega informes.', notFor: null, delivers: null },
    });
  });
});
