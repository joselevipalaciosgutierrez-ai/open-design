// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SkillScopesPanel } from '../../src/components/SkillScopesPanel';
import { I18nProvider } from '../../src/i18n';

const imports: unknown[] = [];

beforeEach(() => {
  imports.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/skill-library/discover') {
      return new Response(JSON.stringify({
        skills: [
          { source: 'antigravity', name: 'zipai-optimizer', description: 'Token optimizer', path: '/h/.gemini/config/skills/zipai', bytes: 10, imported: false },
          { source: 'agents', name: 'expo-native-ui', description: 'Expo', path: '/h/.agents/skills/expo', bytes: 10, imported: true },
        ],
      }));
    }
    if (url === '/api/agent-profiles') {
      return new Response(JSON.stringify({ profiles: [{ id: 'a1', name: 'Desarrollo' }] }));
    }
    if (url === '/api/skill-library/import') {
      imports.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: 'zipai-optimizer' }), { status: 201 });
    }
    return new Response('{}', { status: 404 });
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(onImported = vi.fn()) {
  render(
    <I18nProvider initial="es-ES">
      <SkillScopesPanel onImported={onImported} />
    </I18nProvider>,
  );
  return onImported;
}

describe('SkillScopesPanel', () => {
  it('explains the three scopes', () => {
    setup();
    expect(screen.getByText('Global:')).toBeTruthy();
    expect(screen.getByText('Del agente:')).toBeTruthy();
    expect(screen.getByText('Del proyecto:')).toBeTruthy();
  });

  it('lists the skills found in the CLIs and imports one for one agent', async () => {
    const onImported = setup();
    fireEvent.click(screen.getByTestId('skill-cli-toggle'));
    expect(await screen.findByText('zipai-optimizer')).toBeTruthy();
    expect(screen.getByText('Ya importada')).toBeTruthy();
    fireEvent.change(await screen.findByLabelText('Importar'), { target: { value: 'agent:a1' } });
    fireEvent.click(screen.getByTestId('skill-cli-import'));
    await waitFor(() => expect(onImported).toHaveBeenCalled());
    expect(imports).toEqual([{ path: '/h/.gemini/config/skills/zipai', scope: 'agent', agentId: 'a1' }]);
  });

  it('imports for everyone by default', async () => {
    setup();
    fireEvent.click(screen.getByTestId('skill-cli-toggle'));
    fireEvent.click(await screen.findByTestId('skill-cli-import'));
    await waitFor(() => expect(imports).toEqual([{ path: '/h/.gemini/config/skills/zipai', scope: 'global' }]));
  });
});
