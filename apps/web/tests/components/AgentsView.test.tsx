// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AgentProfile } from '@open-design/contracts';

import { AgentsView } from '../../src/components/AgentsView';
import { I18nProvider } from '../../src/i18n';
import type { AgentInfo, Project } from '../../src/types';

const antigravity = {
  id: 'antigravity',
  name: 'Antigravity',
  bin: 'agy',
  available: true,
  supportsCustomModel: false,
  models: [
    { id: 'Gemini 3.5 Flash (High)', label: 'Gemini 3.5 Flash (High)' },
    { id: 'Claude Sonnet 4.6 (Thinking)', label: 'Claude Sonnet 4.6 (Thinking)' },
  ],
} as AgentInfo;

const design: AgentProfile = {
  id: 'a1',
  name: 'Design',
  role: 'Design and interfaces assistant',
  emoji: '🎨',
  runtimeId: 'antigravity',
  model: 'Gemini 3.5 Flash (High)',
  instructions: 'Write only under design/.',
  skillIds: [],
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
  lastActiveAt: null,
  conversationCount: 0,
};

const projects = [
  { id: 'p-old', name: 'Old project', createdAt: 1, updatedAt: 10 },
  { id: 'p-new', name: 'Recent project', createdAt: 2, updatedAt: 99 },
] as unknown as Project[];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A fetch stub backed by a mutable profile list. */
function stubProfiles(initial: AgentProfile[]) {
  let list = [...initial];
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const href = String(url);
    if (href === '/api/agent-profiles' && (!init || !init.method || init.method === 'GET')) {
      return json({ profiles: list });
    }
    if (href === '/api/agent-profiles' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      const created = { ...design, id: 'a2', lastActiveAt: null, ...body } as AgentProfile;
      list = [...list, created];
      return json({ profile: created }, 201);
    }
    if (href === '/api/skills') {
      return json({ skills: [{ id: 'web-proto', name: 'Web prototype', source: 'user' }, { id: 'deck', name: 'Deck', source: 'user' }, { id: 'bundled', name: 'Bundled thing', source: 'built-in' }] });
    }
    if (href === '/api/skills/import' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      return json({ skill: { id: body.name, name: body.name } }, 201);
    }
    if (href === '/api/design-systems') {
      return json({ designSystems: [{ id: 'airbnb', title: 'Airbnb' }] });
    }
    return json({}, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderView() {
  return render(
    <I18nProvider initial="en">
      <AgentsView agents={[antigravity]} projects={projects} onOpenProject={() => undefined} />
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('AgentsView', () => {
  it('lists each agent with its role, CLI and model', async () => {
    stubProfiles([design]);
    renderView();

    const card = await screen.findByTestId('agent-card-a1');
    expect(card.textContent).toContain('Design');
    expect(card.textContent).toContain('Design and interfaces assistant');
    expect(card.textContent).toContain('Antigravity · Gemini 3.5 Flash (High)');
    expect(card.textContent).toContain('No activity yet');
  });

  it('shows how long ago an agent was last active', async () => {
    stubProfiles([{ ...design, lastActiveAt: Date.now() - 4 * 60 * 60 * 1000 }]);
    renderView();

    const card = await screen.findByTestId('agent-card-a1');
    expect(card.textContent).toContain('Active 4h ago');
  });

  it('explains how to start when there are no agents', async () => {
    stubProfiles([]);
    renderView();

    expect(await screen.findByTestId('agents-empty')).toBeTruthy();
  });

  it('creates an agent from the form and lists it', async () => {
    const fetchMock = stubProfiles([]);
    renderView();
    await screen.findByTestId('agents-empty');

    fireEvent.click(screen.getByTestId('agents-new'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'QA' } });
    fireEvent.change(screen.getByLabelText('Role (one line)'), { target: { value: 'Audits the build' } });
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'Claude Sonnet 4.6 (Thinking)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByTestId('agent-card-a2')).toBeTruthy());
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      name: 'QA',
      role: 'Audits the build',
      runtimeId: 'antigravity',
      model: 'Claude Sonnet 4.6 (Thinking)',
    });
  });

  it('saves the skills and design system picked for an agent', async () => {
    const fetchMock = stubProfiles([]);
    renderView();
    await screen.findByTestId('agents-empty');

    fireEvent.click(screen.getByTestId('agents-new'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'UI' } });
    fireEvent.click(await screen.findByRole('button', { name: '+ Web prototype' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Deck' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Deck' }));
    await screen.findByRole('option', { name: 'Airbnb' });
    fireEvent.change(screen.getByLabelText('Design system'), { target: { value: 'airbnb' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByTestId('agent-card-a2')).toBeTruthy());
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      skillIds: ['web-proto'],
      designSystemId: 'airbnb',
    });
  });

  it('uploads a SKILL.md, imports it and selects it for the agent', async () => {
    const fetchMock = stubProfiles([]);
    renderView();
    await screen.findByTestId('agents-empty');
    fireEvent.click(screen.getByTestId('agents-new'));

    const file = new File(['---\nname: my-skill\ndescription: Does things\n---\nDo the thing.'], 'SKILL.md');
    fireEvent.change(screen.getByTestId('skill-upload'), { target: { files: [file] } });

    await screen.findByText('Skill "my-skill" added.');
    const imp = fetchMock.mock.calls.find(([url]) => String(url) === '/api/skills/import');
    expect(JSON.parse(String(imp?.[1]?.body))).toMatchObject({
      name: 'my-skill',
      description: 'Does things',
      body: 'Do the thing.',
    });
    expect(screen.getByRole('button', { name: 'Remove my-skill' })).toBeTruthy();
  });

  it('suggests only the user\'s own skills and filters them as you type', async () => {
    stubProfiles([]);
    renderView();
    await screen.findByTestId('agents-empty');
    fireEvent.click(screen.getByTestId('agents-new'));
    await screen.findByRole('button', { name: '+ Deck' });
    // Bundled skills are never suggested, only the user's own.
    expect(screen.queryByRole('button', { name: '+ Bundled thing' })).toBeNull();

    fireEvent.change(screen.getByLabelText('Search skills…'), { target: { value: 'deck' } });

    expect(screen.queryByRole('button', { name: '+ Web prototype' })).toBeNull();
    expect(screen.getByRole('button', { name: '+ Deck' })).toBeTruthy();
  });

  it('refuses to save an agent without a name', async () => {
    const fetchMock = stubProfiles([]);
    renderView();
    await screen.findByTestId('agents-empty');

    fireEvent.click(screen.getByTestId('agents-new'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Enter a name.');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('only offers a custom model when the CLI accepts one', async () => {
    stubProfiles([]);
    renderView();
    await screen.findByTestId('agents-empty');

    fireEvent.click(screen.getByTestId('agents-new'));

    // Antigravity declares `supportsCustomModel: false`.
    expect(screen.queryByRole('option', { name: 'Other model…' })).toBeNull();
  });

  it('offers the most recent project first when opening a chat, plus a new project', async () => {
    stubProfiles([design]);
    renderView();

    fireEvent.click(await screen.findByTestId('agent-open-chat-a1'));

    const select = (await screen.findByLabelText('Project')) as HTMLSelectElement;
    expect(select.value).toBe('p-new');
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      'Recent project',
      'Old project',
      'New project',
    ]);
  });
});
