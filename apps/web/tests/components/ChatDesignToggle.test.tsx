// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatSessionMode } from '@open-design/contracts';
import { ChatDesignToggle } from '../../src/components/ChatDesignToggle';
import { I18nProvider } from '../../src/i18n';

afterEach(cleanup);

function renderToggle(mode: ChatSessionMode, onModeChange = vi.fn()) {
  render(
    <I18nProvider initial="es-ES">
      <ChatDesignToggle mode={mode} onModeChange={onModeChange} />
    </I18nProvider>,
  );
  return onModeChange;
}

describe('ChatDesignToggle', () => {
  it('lights the segment of the current mode', () => {
    renderToggle('chat');
    expect(screen.getByTestId('chat-design-toggle-chat').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('chat-design-toggle-design').getAttribute('aria-pressed')).toBe('false');
  });

  it('switches from chat to design and back', () => {
    const onChat = renderToggle('chat');
    fireEvent.click(screen.getByTestId('chat-design-toggle-design'));
    expect(onChat).toHaveBeenCalledWith('design');

    cleanup();
    const onDesign = renderToggle('design');
    fireEvent.click(screen.getByTestId('chat-design-toggle-chat'));
    expect(onDesign).toHaveBeenCalledWith('chat');
  });

  it('does nothing when the current mode is clicked again', () => {
    const onChange = renderToggle('design');
    fireEvent.click(screen.getByTestId('chat-design-toggle-design'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves Plan from either segment, with neither lit while in Plan', () => {
    const onChange = renderToggle('plan');
    expect(screen.getByTestId('chat-design-toggle-chat').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('chat-design-toggle-design').getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByTestId('chat-design-toggle-chat'));
    expect(onChange).toHaveBeenLastCalledWith('chat');
    fireEvent.click(screen.getByTestId('chat-design-toggle-design'));
    expect(onChange).toHaveBeenLastCalledWith('design');
  });

  it('uses the same wording as the composer mode picker', () => {
    renderToggle('chat');
    expect(screen.getByTestId('chat-design-toggle-chat').textContent).toBe('Preguntar');
    expect(screen.getByTestId('chat-design-toggle-design').textContent).toBe('Diseño');
  });
});
