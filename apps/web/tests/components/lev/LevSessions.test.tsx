// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LevSessions, sessionLabel } from '../../../src/components/lev/LevSessions';
import { I18nProvider } from '../../../src/i18n';

const space = {
  projectId: 'lev',
  sessions: [
    { id: 's2', title: 'Plan de la cafetería', preview: 'hazme un plan', messageCount: 4, updatedAt: Date.now() },
    { id: 's1', title: null, preview: 'hola Lev', messageCount: 2, updatedAt: Date.now() - 86_400_000 * 3 },
  ],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(space), { status: 200 })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('sessionLabel', () => {
  it('uses the title, else the first message', () => {
    expect(sessionLabel(space.sessions[0]!, 'x')).toBe('Plan de la cafetería');
    expect(sessionLabel(space.sessions[1]!, 'x')).toBe('hola Lev');
  });
});

describe('LevSessions', () => {
  it('lists earlier sessions and opens the one picked', async () => {
    const onPick = vi.fn();
    render(
      <I18nProvider initial="es-ES">
        <LevSessions currentSessionId="s2" onPick={onPick} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTestId('lev-sessions'));
    await waitFor(() => expect(screen.getAllByTestId('lev-session-item')).toHaveLength(2));
    const items = screen.getAllByTestId('lev-session-item');
    expect(items[0]!.textContent).toContain('Actual');
    fireEvent.click(items[1]!);
    expect(onPick).toHaveBeenCalledWith('lev', 's1');
  });
});
