import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { renderSkillIndex, selectSkillsForTurn, skillRelevance, type IndexableSkill } from '../../src/agent-access/skill-index.js';
import { createSkillScopesStore, normalizeSkillScopes } from '../../src/agent-access/skill-scopes.js';
import { prepareRunSkills } from '../../src/agent-access/run-skills.js';
import { cliSkillRoots, discoverCliSkills, isDiscoverableSkillDir, readFrontMatter } from '../../src/agent-access/skill-discovery.js';

const skill = (id: string, description: string, scope: IndexableSkill['scope']): IndexableSkill => ({ id, name: id, description, scope });

describe('skill index', () => {
  const expo = skill('expo-native-ui', 'Build native UI screens in Expo apps', 'agent');
  const seo = skill('seo-fundamentals', 'Search engine optimization basics', 'agent');

  it('scores skills by the words they share with the message, the name counting double', () => {
    expect(skillRelevance(expo, 'Haz la pantalla nativa con Expo')).toBeGreaterThan(skillRelevance(seo, 'Haz la pantalla nativa con Expo'));
    expect(skillRelevance(seo, 'hola')).toBe(0);
  });

  it('lists every global skill, and all of an agent\'s own when it has only a few', () => {
    const tokens = skill('zipai-optimizer', 'Adaptive token optimizer', 'global');
    expect(selectSkillsForTurn([tokens, expo, seo], 'hola').listed.map((s) => s.id)).toEqual(['zipai-optimizer', 'expo-native-ui', 'seo-fundamentals']);
  });

  it('lists only the related ones when an agent has many', () => {
    const many = [expo, seo, ...['a', 'b', 'c', 'd'].map((x) => skill(`misc-${x}`, `Unrelated ${x}`, 'agent'))];
    const out = selectSkillsForTurn(many, 'Arregla la pantalla de Expo');
    expect(out.listed.map((s) => s.id)).toEqual(['expo-native-ui']);
    expect(out.unlistedAgentSkills).toBe(5);
    expect(selectSkillsForTurn(many, 'hola').listed).toEqual([]);
  });

  it('renders names, one line and the path, and says it is private', () => {
    const text = renderSkillIndex([{ ...expo, path: '/runs/r1/skills/expo-native-ui/SKILL.md' }], 2);
    expect(text).toContain('**expo-native-ui** (yours)');
    expect(text).toContain('`/runs/r1/skills/expo-native-ui/SKILL.md`');
    expect(text).toContain('no other agent can read them');
    expect(text).toContain('2 more of your skills');
    expect(renderSkillIndex([], 0)).toBe('');
  });
});

describe('skill scopes store', () => {
  it('keeps a clean list of global ids', async () => {
    expect(normalizeSkillScopes({ global: ['ok-id', 'ok-id', '../bad', 7] })).toEqual({ global: ['ok-id'] });
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'scopes-'));
    const store = createSkillScopesStore({ dataDir: dir });
    await store.setGlobal('zipai-optimizer', true);
    expect((await store.read()).global).toEqual(['zipai-optimizer']);
    await store.setGlobal('zipai-optimizer', false);
    expect((await store.read()).global).toEqual([]);
    await fsp.rm(dir, { recursive: true, force: true });
  });
});

describe('prepareRunSkills', () => {
  it('copies only the listed skills into the run, and indexes them', async () => {
    const runDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'run-'));
    const copied: string[] = [];
    const out = await prepareRunSkills({
      globalIds: ['tokens'],
      agentIds: ['expo', 'project-skill'],
      activeIds: ['project-skill'],
      library: [
        { id: 'tokens', name: 'tokens', description: 'Token optimizer', dir: '/lib/tokens' },
        { id: 'expo', name: 'expo', description: 'Expo apps', dir: '/lib/expo' },
        { id: 'project-skill', name: 'project-skill', description: 'Active', dir: '/lib/p' },
      ],
      message: 'hola',
      runDir,
      copy: async (from) => {
        copied.push(from);
      },
    });
    expect(copied).toEqual(['/lib/tokens', '/lib/expo']);
    expect(out.listedIds).toEqual(['tokens', 'expo']);
    expect(out.indexPrompt).toContain(path.join(runDir, 'skills', 'expo', 'SKILL.md'));
    expect(out.indexPrompt).not.toContain('project-skill');
    await fsp.rm(runDir, { recursive: true, force: true });
  });
});

describe('skills in the CLIs', () => {
  it('reads name and description from front matter', () => {
    expect(readFrontMatter('---\nname: zipai-optimizer\ndescription: "Adaptive token optimizer"\n---\n# x')).toEqual({
      name: 'zipai-optimizer',
      description: 'Adaptive token optimizer',
    });
    expect(readFrontMatter('# no front matter')).toEqual({ name: null, description: null });
  });

  it('finds skills in each CLI folder and imports only from there', async () => {
    const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'home-'));
    const dir = path.join(home, '.gemini', 'config', 'skills', 'zipai');
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, 'SKILL.md'), '---\nname: zipai-optimizer\ndescription: Token optimizer\n---\nbody');
    const found = await discoverCliSkills(home);
    expect(found).toEqual([{ source: 'antigravity', name: 'zipai-optimizer', description: 'Token optimizer', path: dir, bytes: 63 }]);
    expect(isDiscoverableSkillDir(dir, home)).toBe(true);
    expect(isDiscoverableSkillDir(path.join(home, 'Documents', 'secret'), home)).toBe(false);
    expect(cliSkillRoots(home).map((r) => r.source)).toContain('claude');
    await fsp.rm(home, { recursive: true, force: true });
  });
});
