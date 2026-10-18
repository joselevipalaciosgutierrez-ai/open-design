// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentChip } from '../../src/components/agents/AgentChip';
import { I18nProvider } from '../../src/i18n';

const profile = {
  id: 'a1',
  name: 'Maquetador',
  role: 'Interfaces',
  emoji: '🎨',
  runtimeId: 'antigravity',
  model: null,
  instructions: null,
  skillIds: [],
  designSystemId: null,
  createdAt: 1,
  updatedAt: 1,
  lastActiveAt: null,
  conversationCount: 1,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockProfiles() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ profiles: [profile] }), { status: 200 })),
  );
}

describe('AgentChip', () => {
  it('shows the agent name, runtime and model of the conversation', async () => {
    mockProfiles();
    render(<I18nProvider initial="en"><AgentChip agentProfileId="a1" /></I18nProvider>);
    await waitFor(() => expect(screen.getByTestId('agent-chip')).toBeTruthy());
    expect(screen.getByTestId('agent-chip').textContent).toContain('Maquetador');
    expect(screen.getByTestId('agent-chip').textContent).toContain('antigravity · CLI default');
  });

  it('renders nothing for a conversation without an agent', () => {
    mockProfiles();
    render(<I18nProvider initial="en"><AgentChip agentProfileId={null} /></I18nProvider>);
    expect(screen.queryByTestId('agent-chip')).toBeNull();
  });
});
