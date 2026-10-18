// @vitest-environment jsdom
/**
 * Holding the compact chip (or right-clicking it) lists the installed CLIs so
 * the CLI can be changed without going through Settings. A plain click keeps
 * opening the model popover.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InlineModelSwitcher } from '../../src/components/InlineModelSwitcher';
import type { AgentInfo, AppConfig } from '../../src/types';

vi.mock('../../src/providers/provider-models', () => ({
  fetchProviderModels: vi.fn(async () => ({ ok: false, models: [] })),
}));

const config: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  agentId: 'claude',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: {},
  agentCliEnv: {},
};

const agents = [
  { id: 'claude', name: 'Claude Code', bin: 'claude', available: true, models: [] },
  { id: 'cursor', name: 'Cursor Agent', bin: 'cursor-agent', available: true, models: [] },
  { id: 'aider', name: 'Aider', bin: 'aider', available: false, models: [] },
] as AgentInfo[];

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

function renderSwitcher(over: Partial<AppConfig> = {}) {
  const onAgentChange = vi.fn();
  const onModeChange = vi.fn();
  render(
    <InlineModelSwitcher
      compact
      config={{ ...config, ...over }}
      agents={agents}
      providerModelsCache={{}}
      daemonLive
      onModeChange={onModeChange}
      onAgentChange={onAgentChange}
      onAgentModelChange={vi.fn()}
      onApiModelChange={vi.fn()}
      onApiProtocolChange={vi.fn()}
      onOpenSettings={vi.fn()}
    />,
  );
  return { onAgentChange, onModeChange };
}

function hold(chip: HTMLElement) {
  vi.useFakeTimers();
  fireEvent.pointerDown(chip, { button: 0 });
  act(() => {
    vi.advanceTimersByTime(700);
  });
  fireEvent.pointerUp(chip);
  fireEvent.click(chip);
  vi.useRealTimers();
}

describe('InlineModelSwitcher · switching the CLI', () => {
  it('lists installed CLIs on a long press and switches to the chosen one', () => {
    const { onAgentChange } = renderSwitcher();

    hold(screen.getByTestId('inline-model-switcher-chip'));

    expect(screen.queryByTestId('inline-model-switcher-popover')).toBeNull();
    expect(screen.getByTestId('cli-picker-option-claude').getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByTestId('cli-picker-option-aider')).toBeNull();

    fireEvent.click(screen.getByTestId('cli-picker-option-cursor'));
    expect(onAgentChange).toHaveBeenCalledWith('cursor');
  });

  it('switches back to local CLI mode when it was on a BYOK provider', () => {
    const { onAgentChange, onModeChange } = renderSwitcher({ mode: 'api', apiKey: 'k' });

    fireEvent.contextMenu(screen.getByTestId('inline-model-switcher-chip'));
    fireEvent.click(screen.getByTestId('cli-picker-option-cursor'));

    expect(onModeChange).toHaveBeenCalledWith('daemon');
    expect(onAgentChange).toHaveBeenCalledWith('cursor');
  });

  it('keeps a plain click on the model popover', () => {
    renderSwitcher();

    fireEvent.click(screen.getByTestId('inline-model-switcher-chip'));

    expect(screen.getByTestId('inline-model-switcher-popover')).toBeTruthy();
    expect(screen.queryByTestId('cli-picker-menu')).toBeNull();
  });
});
