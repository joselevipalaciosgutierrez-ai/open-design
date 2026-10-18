// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '../../src/components/ChatComposer';
import { flushMounts } from '../helpers/lexical-composer';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderComposer(props: Partial<React.ComponentProps<typeof ChatComposer>> = {}) {
  return render(
    <ChatComposer
      projectId="project-1"
      projectFiles={[]}
      streaming={false}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      {...props}
    />,
  );
}

// Upstream removed the picker from project chat (2026-08-19). This fork restores
// it: it appears whenever the host passes `onSessionModeChange`, so a plain Ask
// conversation can be switched to Design from inside the chat.
describe('ChatComposer session-mode picker', () => {
  it('does not show the picker when the host gives no mode-change handler', async () => {
    renderComposer();
    await flushMounts();

    expect(screen.queryByTestId('composer-mode-trigger')).toBeNull();
    expect(screen.queryByTestId('composer-mode-clear')).toBeNull();
  });

  it('shows the picker with the conversation mode when a handler is given', async () => {
    renderComposer({ sessionMode: 'chat', onSessionModeChange: vi.fn() });
    await flushMounts();

    expect(screen.getByTestId('composer-mode-trigger').getAttribute('aria-label')).toBe('Mode: Ask');
  });

  it('reports the new mode when the user switches from Ask to Design', async () => {
    const onSessionModeChange = vi.fn();
    renderComposer({ sessionMode: 'chat', onSessionModeChange });
    await flushMounts();

    fireEvent.click(screen.getByTestId('composer-mode-trigger'));
    fireEvent.click(screen.getByTestId('composer-mode-menu-design'));

    expect(onSessionModeChange).toHaveBeenCalledWith('design');
  });
});
