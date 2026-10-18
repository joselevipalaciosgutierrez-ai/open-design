// @vitest-environment jsdom
//
// Home's composer mounts the session-mode picker chip (Design / Ask / Plan).
//
// Upstream removed this chip on 2026-09-08 and pinned the removal in this very
// file. This fork restores it: Ask ('chat') is the entry point for the central
// chat, so Home must let the user choose the mode the new conversation runs in.
//
// Pinned here:
//   1. The chip is rendered, with Design selected by default.
//   2. With nothing picked, Home still submits `conversationMode: 'design'`.
//   3. Picking Ask makes Home submit `conversationMode: 'chat'`.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

import { HomeView } from '../../src/components/HomeView';
import { I18nProvider } from '../../src/i18n';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch() {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const href = typeof url === 'string' ? url : String(url);
    if (href === '/api/plugins') return json({ plugins: [] });
    if (href === '/api/mcp/servers') return json({ servers: [], templates: [] });
    if (href === '/api/workspace/directory') return json({ items: [], activeWorkspaceId: null });
    return json({});
  }));
}

function renderHome(overrides: Partial<React.ComponentProps<typeof HomeView>> = {}) {
  return render(
    <I18nProvider initial="en">
      <HomeView
        projects={[] as never}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        {...overrides}
      />
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('HomeView — composer session-mode picker', () => {
  it('renders the mode picker in the Home composer with Design selected by default', async () => {
    stubFetch();
    renderHome();

    // The composer is really painted, so the assertions below cannot pass for
    // the wrong reason (an empty render would not satisfy them).
    await waitFor(() => expect(screen.getByTestId('home-hero-input')).toBeTruthy());
    expect(screen.getByTestId('home-hero-submit')).toBeTruthy();

    const trigger = screen.getByTestId('composer-mode-trigger');
    expect(trigger.getAttribute('aria-label')).toBe('Mode: Design');
    expect(screen.getByTestId('composer-mode-clear')).toBeTruthy();
  });

  it('submits Design as the conversation mode by default', async () => {
    stubFetch();
    const onSubmit = vi.fn();
    renderHome({ onSubmit });

    await waitFor(() => expect(screen.getByTestId('home-hero-input')).toBeTruthy());

    setHomeHeroPrompt('Create a clean loading animation');
    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() =>
      expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      prompt: 'Create a clean loading animation',
      conversationMode: 'design',
    });
  });

  it('submits Ask as the conversation mode after picking it', async () => {
    stubFetch();
    const onSubmit = vi.fn();
    renderHome({ onSubmit });

    await waitFor(() => expect(screen.getByTestId('home-hero-input')).toBeTruthy());

    fireEvent.click(screen.getByTestId('composer-mode-trigger'));
    fireEvent.click(screen.getByTestId('composer-mode-menu-chat'));

    setHomeHeroPrompt('Which structure works best for a pricing page?');
    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() =>
      expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      prompt: 'Which structure works best for a pricing page?',
      conversationMode: 'chat',
    });
  });
});
