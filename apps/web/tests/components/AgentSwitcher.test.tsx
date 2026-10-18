// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentSwitcher } from '../../src/components/agents/AgentSwitcher';
import { I18nProvider } from '../../src/i18n';

const base = {
  role: null,
  emoji: null,
  runtimeId: 'antigravity',
  model: null,
  instructions: null,
  skillIds: [],
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
  lastActiveAt: null,
  conversationCount: 0,
};
const profiles = [
  { ...base, id: 'a1', name: 'Dise\u00f1o', emoji: '\ud83c\udfa8' },
  { ...base, id: 'a2', name: 'QA' },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stub() {
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url) === '/api/agent-profiles') {
      return new Response(JSON.stringify({ profiles }), { status: 200 });
    }
    if (init?.method === 'PATCH') {
      return new Response(JSON.stringify({ conversation: { id: 'c1' } }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderSwitcher(agentProfileId: string | null) {
  return render(
    <I18nProvider initial="en">
      <AgentSwitcher projectId="p1" conversationId="c1" agentProfileId={agentProfileId} />
    </I18nProvider>,
  );
}

describe('AgentSwitcher', () => {
  it('shows the current agent and switches the conversation to another one', async () => {
    const fetchMock = stub();
    renderSwitcher('a1');
    const trigger = await screen.findByRole('button', { name: /Dise\u00f1o/ });

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitemradio', { name: /QA/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: /QA/ })).toBeTruthy());
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(String(patch?.[0])).toBe('/api/projects/p1/conversations/c1');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ agentProfileId: 'a2' });
  });

  it('can detach the conversation from its agent', async () => {
    const fetchMock = stub();
    renderSwitcher('a1');
    fireEvent.click(await screen.findByRole('button', { name: /Dise\u00f1o/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'No agent' }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'PATCH')).toBe(true));
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ agentProfileId: null });
  });

  it('stays hidden when there are no agents', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ profiles: [] }))));
    renderSwitcher(null);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByTestId('agent-switcher')).toBeNull();
  });
});
