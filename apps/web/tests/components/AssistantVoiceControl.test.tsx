// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VoiceSessionError } from '../../src/runtime/assistant/voice-session';

const hook = vi.hoisted(() => ({
  state: 'idle' as 'idle' | 'listen' | 'think' | 'speak',
  phase: 'idle' as 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking',
  toggle: vi.fn(),
  speak: vi.fn(async () => {}),
  options: null as null | { onTranscript: (t: string) => void; onNotice: (e: VoiceSessionError) => void; thinking: boolean },
}));

vi.mock('../../src/components/assistant/use-voice-assistant', () => ({
  useVoiceAssistant: (options: NonNullable<typeof hook.options>) => {
    hook.options = options;
    return { phase: hook.phase, monkeyState: hook.state, toggle: hook.toggle, speak: hook.speak, stopTalking: vi.fn() };
  },
}));

import { AssistantVoiceControl } from '../../src/components/assistant/AssistantVoiceControl';
import { I18nProvider } from '../../src/i18n';
import { getAssistantStage, setAssistantStage } from '../../src/state/assistant-voice-store';

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  hook.state = 'idle';
  hook.phase = 'idle';
  hook.toggle.mockClear();
  hook.speak.mockClear();
});
afterEach(() => {
  setAssistantStage('off');
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
});

function setup(props: Partial<React.ComponentProps<typeof AssistantVoiceControl>> = {}, locale: 'es-ES' | 'en' = 'es-ES') {
  const onTranscript = vi.fn();
  const view = (reply: React.ComponentProps<typeof AssistantVoiceControl>['reply']) => (
    <I18nProvider initial={locale}>
      <AssistantVoiceControl thinking={false} onTranscript={onTranscript} {...props} reply={reply} />
    </I18nProvider>
  );
  const utils = render(view(props.reply ?? null));
  return { onTranscript, rerender: (reply: React.ComponentProps<typeof AssistantVoiceControl>['reply']) => utils.rerender(view(reply)) };
}

describe('AssistantVoiceControl', () => {
  it('is one click on the monkey', () => {
    setup();
    fireEvent.click(screen.getByTestId('assistant-monkey'));
    expect(hook.toggle).toHaveBeenCalledTimes(1);
  });

  it('labels the monkey for what a click will do now', () => {
    setup();
    expect(screen.getByTestId('assistant-monkey').getAttribute('aria-label')).toBe('Hablar con el asistente');
    cleanup();
    hook.phase = 'listening';
    setup();
    expect(screen.getByTestId('assistant-monkey').getAttribute('aria-label')).toBe('Dejar de escuchar');
    cleanup();
    hook.phase = 'speaking';
    setup({}, 'en');
    expect(screen.getByTestId('assistant-monkey').getAttribute('aria-label')).toBe('Quiet the assistant');
  });

  it('passes what was said on as a message and reads the next reply aloud', () => {
    const { onTranscript, rerender } = setup();
    act(() => hook.options!.onTranscript('crea una landing'));
    expect(onTranscript).toHaveBeenCalledWith('crea una landing');
    rerender({ id: 'm1', text: 'Listo, ya la creé.' });
    expect(hook.speak).toHaveBeenCalledWith('Listo, ya la creé.');
  });

  it('reads a spoken request\'s reply while it is still being written', () => {
    const { rerender } = setup();
    act(() => hook.options!.onTranscript('hola'));
    rerender({ id: 'm1', text: '', done: false });
    rerender({ id: 'm1', text: '¡Hola! Todo bi', done: false });
    expect(hook.speak).toHaveBeenCalledWith('¡Hola! ...');
    rerender({ id: 'm1', text: '¡Hola! Todo bien.', done: true });
    expect(hook.speak).toHaveBeenLastCalledWith('Todo bien.');
    expect(hook.speak).toHaveBeenCalledTimes(2);
  });

  it('keeps quiet for a reply to a typed message', () => {
    const { rerender } = setup();
    rerender({ id: 'm1', text: 'Respuesta a algo escrito' });
    expect(hook.speak).not.toHaveBeenCalled();
  });

  it('reads each spoken request\'s reply once, and not a reply that was already there', () => {
    const { rerender } = setup({ reply: { id: 'old', text: 'viejo' } });
    act(() => hook.options!.onTranscript('hola'));
    rerender({ id: 'old', text: 'viejo' });
    expect(hook.speak).not.toHaveBeenCalled();
    rerender({ id: 'new', text: 'nuevo' });
    expect(hook.speak).toHaveBeenCalledTimes(1);
    rerender({ id: 'new', text: 'nuevo' });
    expect(hook.speak).toHaveBeenCalledTimes(1);
  });

  it('tells the person what went wrong, in their language', () => {
    setup();
    expect(screen.queryByTestId('assistant-notice')).toBeNull();
    act(() => hook.options!.onNotice({ code: 'stt-unavailable', reason: 'binary-missing' }));
    expect(screen.getByTestId('assistant-notice').textContent).toContain('whisper.cpp');
    act(() => hook.options!.onNotice({ code: 'no-speech' }));
    expect(screen.getByTestId('assistant-notice').textContent).toContain('No te escuché');
  });

  it('clears the notice once the person speaks again', () => {
    setup();
    act(() => hook.options!.onNotice({ code: 'no-speech' }));
    act(() => hook.options!.onTranscript('hola'));
    expect(screen.queryByTestId('assistant-notice')).toBeNull();
  });

  it('tells the hook an agent is working so the monkey thinks', () => {
    setup({ thinking: true });
    expect(hook.options!.thinking).toBe(true);
  });

  describe('standing out of the composer', () => {
    function hold(ms: number) {
      const monkey = screen.getByTestId('assistant-monkey');
      fireEvent.pointerDown(monkey);
      act(() => {
        vi.advanceTimersByTime(ms);
      });
      fireEvent.pointerUp(monkey);
      fireEvent.click(monkey);
    }

    it('listens on a hold on Home, and stands out large once what was said opens the chat', () => {
      vi.useFakeTimers();
      setup({ stageMode: 'home' });
      hold(600);
      expect(hook.toggle).toHaveBeenCalledTimes(1);
      expect(getAssistantStage()).toBe('off');
      expect(screen.queryByTestId('assistant-stage')).toBeNull();
      act(() => hook.options!.onTranscript('hola'));
      expect(getAssistantStage()).toBe('big');
    });

    it('a plain click on Home just listens, as always', () => {
      vi.useFakeTimers();
      setup({ stageMode: 'home' });
      hold(100);
      expect(getAssistantStage()).toBe('off');
      expect(hook.toggle).toHaveBeenCalledTimes(1);
    });

    it('in a chat a click stays in the composer and a hold comes out softly while listening', () => {
      vi.useFakeTimers();
      setup({ stageMode: 'chat' });
      hold(100);
      expect(getAssistantStage()).toBe('off');
      expect(hook.toggle).toHaveBeenCalledTimes(1);
      cleanup();
      hook.toggle.mockClear();
      setup({ stageMode: 'chat' });
      hold(600);
      expect(getAssistantStage()).toBe('subtle');
      expect(hook.toggle).toHaveBeenCalledTimes(1);
    });

    it('stays in the composer where there is a design or a preview', () => {
      vi.useFakeTimers();
      setup({ stageMode: 'off' });
      hold(900);
      expect(getAssistantStage()).toBe('off');
      expect(screen.queryByTestId('assistant-stage')).toBeNull();
    });

    it('folds back into the composer after a while without talking', () => {
      vi.useFakeTimers();
      setup({ stageMode: 'chat' });
      hold(600);
      act(() => {
        vi.advanceTimersByTime(13_000);
      });
      expect(getAssistantStage()).toBe('off');
      expect(screen.queryByTestId('assistant-stage')).toBeNull();
    });

    it('grows a little while it talks', () => {
      hook.phase = 'speaking';
      hook.state = 'speak';
      setup();
      expect(document.querySelector('[data-speaking="true"]')).toBeTruthy();
    });
  });
});
