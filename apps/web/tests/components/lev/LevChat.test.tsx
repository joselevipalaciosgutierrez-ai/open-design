// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LevChat, visibleReplyText } from '../../../src/components/lev/LevChat';
import { I18nProvider } from '../../../src/i18n';

afterEach(cleanup);

describe('visibleReplyText', () => {
  it('shows the answer after the done marker, without control markers', () => {
    const content = 'Leyendo archivos…<od-done key="k1"/>¡Hola!<od-next key="k1" value="Haz X"/>';
    expect(visibleReplyText(content, false)).toBe('¡Hola!');
  });

  it('shows plain replies as they are', () => {
    expect(visibleReplyText('Hola, soy Lev.', true)).toBe('Hola, soy Lev.');
  });
});

describe('LevChat', () => {
  it('lists the conversation and says Lev is thinking while the reply has no text yet', () => {
    const onFold = vi.fn();
    render(
      <I18nProvider initial="es-ES">
        <LevChat
          messages={[
            { id: 'u1', role: 'user', content: 'hola' },
            { id: 'a1', role: 'assistant', content: '' },
          ]}
          streaming
          error={null}
          onNewSession={vi.fn()}
          onFold={onFold}
          currentSessionId="s1"
          onPickSession={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.getByText('hola')).toBeTruthy();
    expect(screen.getByText('Lev está pensando…')).toBeTruthy();
    fireEvent.click(screen.getByTestId('lev-fold'));
    expect(onFold).toHaveBeenCalled();
  });
});
