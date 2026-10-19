// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppearanceSection } from '../../src/components/appearance/AppearanceSection';
import { I18nProvider } from '../../src/i18n';

afterEach(cleanup);

function renderSection(theme: 'system' | 'light' | 'dark', onThemeChange = vi.fn(), initial: 'es-ES' | 'en' = 'es-ES') {
  render(
    <I18nProvider initial={initial}>
      <AppearanceSection theme={theme} onThemeChange={onThemeChange} />
    </I18nProvider>,
  );
  return onThemeChange;
}

describe('AppearanceSection', () => {
  it('offers system, light and dark, marking the current one', () => {
    renderSection('dark');
    expect(screen.getByTestId('appearance-theme-dark').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('appearance-theme-light').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('appearance-theme-system').textContent).toContain('Sistema');
  });

  it('reports the picked theme, and stays quiet when the current one is clicked', () => {
    const onThemeChange = renderSection('system');
    fireEvent.click(screen.getByTestId('appearance-theme-system'));
    expect(onThemeChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('appearance-theme-dark'));
    expect(onThemeChange).toHaveBeenCalledWith('dark');
  });

  it('speaks English when the app does', () => {
    renderSection('light', vi.fn(), 'en');
    expect(screen.getByTestId('appearance-theme-dark').textContent).toContain('Dark');
  });
});
