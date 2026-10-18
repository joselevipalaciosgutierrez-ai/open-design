// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useAgentsCopy } from '../../src/components/agents/use-agents-copy';
import { I18nProvider, useI18n } from '../../src/i18n';

afterEach(cleanup);

const wrap = (locale: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <I18nProvider initial={locale as never}>{children}</I18nProvider>;
  };

describe('useAgentsCopy', () => {
  it('follows the app language from the i18n context', () => {
    expect(renderHook(() => useAgentsCopy(), { wrapper: wrap('es-ES') }).result.current.statusChanges).toBe('Cambios');
    expect(renderHook(() => useAgentsCopy(), { wrapper: wrap('en') }).result.current.statusChanges).toBe('Changes');
  });

  it('keeps English for languages it has no copy for', () => {
    expect(renderHook(() => useAgentsCopy(), { wrapper: wrap('ja') }).result.current.statusChanges).toBe('Changes');
  });

  it('switches when the user changes the app language', () => {
    const { result } = renderHook(() => ({ copy: useAgentsCopy(), i18n: useI18n() }), { wrapper: wrap('en') });
    expect(result.current.copy.statusChanges).toBe('Changes');

    act(() => result.current.i18n.setLocale('es-ES'));

    expect(result.current.copy.statusChanges).toBe('Cambios');
  });

  it('ignores a misleading <html lang>, which the nested providers can leave wrong', () => {
    document.documentElement.setAttribute('lang', 'en');
    expect(renderHook(() => useAgentsCopy(), { wrapper: wrap('es-ES') }).result.current.statusChanges).toBe('Cambios');
    document.documentElement.setAttribute('lang', '');
  });
});
