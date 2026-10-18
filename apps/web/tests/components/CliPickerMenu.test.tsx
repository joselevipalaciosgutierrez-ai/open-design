// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CliPickerMenu } from '../../src/components/agents/CliPickerMenu';
import type { AgentInfo } from '../../src/types';

const agents = [
  { id: 'claude', name: 'Claude Code', bin: 'claude', available: true },
  { id: 'antigravity', name: 'Antigravity', bin: 'agy', available: true },
  { id: 'aider', name: 'Aider', bin: 'aider', available: false },
] as AgentInfo[];

afterEach(cleanup);

function renderMenu(props: Partial<Parameters<typeof CliPickerMenu>[0]> = {}) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  document.documentElement.lang = 'en';
  render(
    <CliPickerMenu
      anchor={document.body}
      agents={agents}
      currentAgentId="antigravity"
      onSelect={onSelect}
      onClose={onClose}
      {...props}
    />,
  );
  return { onSelect, onClose };
}

describe('CliPickerMenu', () => {
  it('lists only installed CLIs and marks the current one', () => {
    renderMenu();
    expect(screen.getByTestId('cli-picker-option-claude')).toBeTruthy();
    expect(screen.queryByTestId('cli-picker-option-aider')).toBeNull();
    expect(screen.getByTestId('cli-picker-option-antigravity').getAttribute('aria-checked')).toBe('true');
  });

  it('selects a CLI and closes', () => {
    const { onSelect, onClose } = renderMenu();
    fireEvent.click(screen.getByTestId('cli-picker-option-claude'));
    expect(onSelect).toHaveBeenCalledWith('claude');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const { onClose } = renderMenu();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('says so when no CLI is installed', () => {
    renderMenu({ agents: [agents[2]!] });
    expect(screen.getByTestId('cli-picker-menu').textContent).toContain('No CLI is installed');
  });
});
