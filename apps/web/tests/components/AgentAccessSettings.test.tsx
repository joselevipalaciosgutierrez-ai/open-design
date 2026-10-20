// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentAccessSettings } from '../../src/components/appearance/AgentAccessSettings';
import { I18nProvider } from '../../src/i18n';

let access = { allowedDirs: [] as string[], readWholeMac: true, macControl: false };
const puts: unknown[] = [];

beforeEach(() => {
  access = { allowedDirs: [], readWholeMac: true, macControl: false };
  puts.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/mac/status') {
      return new Response(JSON.stringify({ enabled: access.macControl, supported: true, accessibility: false }));
    }
    if (init?.method === 'PUT') {
      const patch = JSON.parse(String(init.body)) as Partial<typeof access>;
      puts.push(patch);
      const refused = (patch.allowedDirs ?? []).filter((d) => d === '/').map((path) => ({ path, reason: 'the whole disk' }));
      access = { ...access, ...patch, allowedDirs: (patch.allowedDirs ?? access.allowedDirs).filter((d) => d !== '/') };
      return new Response(JSON.stringify({ access, enforced: true, refused }));
    }
    return new Response(JSON.stringify({ access, enforced: true }));
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup() {
  render(
    <I18nProvider initial="es-ES">
      <AgentAccessSettings />
    </I18nProvider>,
  );
}

describe('AgentAccessSettings', () => {
  it('shows that only the project is writable, and the rules it always asks about', async () => {
    setup();
    expect(await screen.findByText('Solo en la carpeta del proyecto.')).toBeTruthy();
    expect(screen.getByText('Instalar programas')).toBeTruthy();
  });

  it('adds and removes a folder', async () => {
    setup();
    fireEvent.change(await screen.findByTestId('agent-access-folder-input'), { target: { value: '/Users/ana/Code/app' } });
    fireEvent.click(screen.getByTestId('agent-access-add'));
    expect(await screen.findByText('/Users/ana/Code/app')).toBeTruthy();
    fireEvent.click(screen.getByTestId('agent-access-remove'));
    await waitFor(() => expect(screen.queryByText('/Users/ana/Code/app')).toBeNull());
    expect(puts).toEqual([{ allowedDirs: ['/Users/ana/Code/app'] }, { allowedDirs: [] }]);
  });

  it('says why a folder was refused', async () => {
    setup();
    fireEvent.change(await screen.findByTestId('agent-access-folder-input'), { target: { value: '/' } });
    fireEvent.click(screen.getByTestId('agent-access-add'));
    expect((await screen.findByTestId('agent-access-error')).textContent).toContain('the whole disk');
  });

  it('turns Mac control on and tells what macOS still needs', async () => {
    setup();
    fireEvent.click(await screen.findByTestId('agent-access-mac-control'));
    expect(await screen.findByTestId('agent-access-accessibility')).toBeTruthy();
    expect(puts).toContainEqual({ macControl: true });
  });
});
