// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { McpScopeSelect, resetMcpScopeCache } from '../../src/components/McpScopeSelect';
import { I18nProvider } from '../../src/i18n';

const puts: unknown[] = [];

beforeEach(() => {
  resetMcpScopeCache();
  puts.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/agent-profiles') return new Response(JSON.stringify({ profiles: [{ id: 'a1', name: 'Diseño' }] }));
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as { serverId: string; agentIds: string[] | null };
      puts.push(body);
      return new Response(JSON.stringify({ agentOnly: body.agentIds ? { [body.serverId]: body.agentIds } : {} }));
    }
    return new Response(JSON.stringify({ agentOnly: {} }));
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('McpScopeSelect', () => {
  it('starts global and can give the server to one agent, then back to everyone', async () => {
    render(<I18nProvider initial="es-ES"><McpScopeSelect serverId="figma" /></I18nProvider>);
    const select = (await screen.findByTestId('mcp-scope-select')) as HTMLSelectElement;
    expect(select.value).toBe('');
    fireEvent.change(select, { target: { value: 'a1' } });
    await waitFor(() => expect(select.value).toBe('a1'));
    fireEvent.change(select, { target: { value: '' } });
    await waitFor(() => expect(puts).toEqual([{ serverId: 'figma', agentIds: ['a1'] }, { serverId: 'figma', agentIds: null }]));
  });
});
