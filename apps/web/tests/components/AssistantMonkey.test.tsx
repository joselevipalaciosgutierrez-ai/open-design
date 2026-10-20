// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssistantMonkey } from '../../src/components/assistant/AssistantMonkey';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number);
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AssistantMonkey', () => {
  it('is a button with a label and the state it is in', () => {
    render(<AssistantMonkey state="listen" label="Hablar con el asistente" />);
    const button = screen.getByTestId('assistant-monkey');
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('aria-label')).toBe('Hablar con el asistente');
    expect(button.getAttribute('data-state')).toBe('listen');
  });

  it('reports a click', () => {
    const onClick = vi.fn();
    render(<AssistantMonkey onClick={onClick} />);
    fireEvent.click(screen.getByTestId('assistant-monkey'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('spreads three rings while listening and none otherwise', () => {
    const { container, rerender } = render(<AssistantMonkey state="idle" />);
    const rings = () => [...container.querySelectorAll('g > circle[stroke="var(--monkey-ripple)"]')];
    expect(rings()).toHaveLength(3);
    act(() => { vi.advanceTimersByTime(400); });
    expect(rings().every((r) => Number(r.getAttribute('opacity')) === 0)).toBe(true);
    rerender(<AssistantMonkey state="listen" />);
    act(() => { vi.advanceTimersByTime(1200); });
    expect(rings().some((r) => Number(r.getAttribute('opacity')) > 0.05)).toBe(true);
  });

  it('opens its mouth while speaking, with the tongue inside it', () => {
    const { container } = render(<AssistantMonkey state="speak" />);
    const mouth = container.querySelector('g[opacity]') as SVGGElement | null;
    let sawOpen = false;
    for (let i = 0; i < 80; i += 1) {
      act(() => { vi.advanceTimersByTime(50); });
      const group = container.querySelector('ellipse[fill="#e07f86"]')?.parentElement;
      if (group?.getAttribute('opacity') === '1') sawOpen = true;
    }
    expect(mouth).not.toBeNull();
    expect(sawOpen).toBe(true);
  });

  it('follows an external mouth level while speaking', () => {
    const level = { current: 0.9 as number | null };
    const { container } = render(<AssistantMonkey state="speak" mouthLevelRef={level} />);
    act(() => { vi.advanceTimersByTime(400); });
    const cavity = container.querySelector('ellipse[fill="#141416"]:not([clip-path])') as SVGEllipseElement;
    const open = [...container.querySelectorAll('ellipse')].filter((e) => e.getAttribute('fill') === '#141416');
    expect(open.length).toBeGreaterThan(0);
    expect(cavity).not.toBeNull();
    const ry = Math.max(...open.map((e) => Number(e.getAttribute('ry'))));
    expect(ry).toBeGreaterThan(2.5);
  });

  it('winks the right eye on the wink state and opens it again', () => {
    const { container, rerender } = render(<AssistantMonkey state="idle" />);
    const rightEye = () => container.querySelector('circle[cx="25.5"][r="2"]')?.parentElement as unknown as SVGGElement;
    rerender(<AssistantMonkey state="wink" />);
    act(() => { vi.advanceTimersByTime(300); });
    const scaleY = (el: SVGGElement) => Number(/scale\([^,]+,\s*([\d.]+)\)/.exec(el.style.transform)?.[1] ?? 1);
    expect(scaleY(rightEye())).toBeLessThan(0.5);
    rerender(<AssistantMonkey state="idle" />);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(scaleY(rightEye())).toBeGreaterThan(0.8);
  });

  it('stops its loop when unmounted', () => {
    const { unmount } = render(<AssistantMonkey state="speak" />);
    act(() => { vi.advanceTimersByTime(200); });
    unmount();
    expect(() => act(() => { vi.advanceTimersByTime(500); })).not.toThrow();
  });
});
