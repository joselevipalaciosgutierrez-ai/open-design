// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComposerAgentPicker } from '../../src/components/ComposerAgentPicker';
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
  { ...base, id: 'a1', name: 'Diseño', emoji: '🎨', role: 'Interfaces' },
  { ...base, id: 'a2', name: 'QA' },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stub(list: unknown[] = profiles) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ profiles: list }), { status: 200 })),
  );
}

function Host({ initial = null, onChange }: { initial?: string | null; onChange?: (id: string | null) => void }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <I18nProvider initial="es-ES">
      <ComposerAgentPicker
        value={value}
        onChange={(id) => {
          setValue(id);
          onChange?.(id);
        }}
      />
    </I18nProvider>
  );
}

describe('ComposerAgentPicker', () => {
  it('says "Agentes" when no agent is selected', () => {
    stub();
    render(<Host />);
    expect(screen.getByTestId('composer-agent-trigger').textContent).toBe('Agentes');
    expect(screen.queryByTestId('composer-agent-clear')).toBeNull();
  });

  it('lists the agents, lets you pick exactly one and shows it in the chip', async () => {
    stub();
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);

    fireEvent.click(screen.getByTestId('composer-agent-trigger'));
    fireEvent.click(await screen.findByTestId('composer-agent-option-a1'));
    expect(onChange).toHaveBeenLastCalledWith('a1');
    await waitFor(() =>
      expect(screen.getByTestId('composer-agent-trigger').textContent).toContain('Diseño'),
    );

    fireEvent.click(screen.getByTestId('composer-agent-trigger'));
    fireEvent.click(await screen.findByTestId('composer-agent-option-a2'));
    expect(onChange).toHaveBeenLastCalledWith('a2');
    expect(screen.getByTestId('composer-agent-trigger').textContent).toContain('QA');
  });

  it('clears the selection with the × and goes back to "Agentes"', async () => {
    stub();
    const onChange = vi.fn();
    render(<Host initial="a1" onChange={onChange} />);
    await waitFor(() =>
      expect(screen.getByTestId('composer-agent-trigger').textContent).toContain('Diseño'),
    );

    fireEvent.click(screen.getByTestId('composer-agent-clear'));

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByTestId('composer-agent-trigger').textContent).toBe('Agentes');
  });

  it('offers "Predeterminado" in the menu only while an agent is selected', async () => {
    stub();
    const onChange = vi.fn();
    render(<Host initial="a1" onChange={onChange} />);
    await waitFor(() =>
      expect(screen.getByTestId('composer-agent-trigger').textContent).toContain('Diseño'),
    );

    fireEvent.click(screen.getByTestId('composer-agent-trigger'));
    fireEvent.click(await screen.findByTestId('composer-agent-default'));

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByTestId('composer-agent-trigger').textContent).toBe('Agentes');
    fireEvent.click(screen.getByTestId('composer-agent-trigger'));
    expect(screen.queryByTestId('composer-agent-default')).toBeNull();
  });

  it('tells you there are no agents yet instead of showing an empty menu', async () => {
    stub([]);
    render(<Host />);
    fireEvent.click(screen.getByTestId('composer-agent-trigger'));
    expect((await screen.findByTestId('composer-agent-menu')).textContent).toContain(
      'Todavía no tienes agentes.',
    );
  });
});
