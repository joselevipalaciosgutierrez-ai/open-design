// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MonkeyAura } from '../../src/components/assistant/MonkeyAura';
import { setAssistantPhase } from '../../src/state/assistant-voice-store';

/** A WebGL context that records what the aura asks of it. */
function fakeGl() {
  const calls: Record<string, number> = {};
  const count = (name: string) => { calls[name] = (calls[name] ?? 0) + 1; };
  const gl: Record<string, unknown> = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, LINK_STATUS: 3, ARRAY_BUFFER: 4, STATIC_DRAW: 5, FLOAT: 6,
    BLEND: 7, ONE: 8, ONE_MINUS_SRC_ALPHA: 9, COLOR_BUFFER_BIT: 10, TRIANGLES: 11,
    createShader: () => ({}), shaderSource: () => {}, compileShader: () => {},
    createProgram: () => ({}), attachShader: () => {}, linkProgram: () => {}, getProgramParameter: () => true,
    useProgram: () => {}, createBuffer: () => ({}), bindBuffer: () => {}, bufferData: () => {},
    getAttribLocation: () => 0, enableVertexAttribArray: () => {}, vertexAttribPointer: () => {},
    enable: () => {}, blendFunc: () => {}, viewport: () => {}, getUniformLocation: (_p: unknown, n: string) => n,
    uniform1f: (n: string) => count(`uniform1f:${n}`), uniform2f: () => {}, uniform3fv: (n: string) => count(`uniform3fv:${n}`),
    clearColor: () => {}, clear: () => count('clear'), drawArrays: () => count('draw'),
    getExtension: () => ({ loseContext: () => count('lose') }),
  };
  return { gl, calls };
}

let ctx: ReturnType<typeof fakeGl>;

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  setAssistantPhase('idle');
  ctx = fakeGl();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ctx.gl) as never);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number);
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});
afterEach(() => {
  cleanup();
  setAssistantPhase('idle');
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('MonkeyAura', () => {
  it('draws nothing, and runs no loop, while the assistant is idle', () => {
    render(<MonkeyAura size={36} />);
    expect(screen.queryByTestId('monkey-aura')).toBeNull();
    act(() => { vi.advanceTimersByTime(500); });
    expect(ctx.calls.draw).toBeUndefined();
  });

  it('appears and animates while listening and speaking, and lets go of the GPU when done', () => {
    const { unmount } = render(<MonkeyAura size={36} />);
    act(() => setAssistantPhase('listening'));
    expect(screen.getByTestId('monkey-aura')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(300); });
    expect(ctx.calls.draw).toBeGreaterThan(5);
    expect(ctx.calls['uniform3fv:uC1']).toBe(1);
    act(() => setAssistantPhase('speaking'));
    act(() => { vi.advanceTimersByTime(300); });
    expect(ctx.calls['uniform1f:uLevel']).toBeGreaterThan(10);
    act(() => setAssistantPhase('idle'));
    // It fades out and its loop sleeps, but the canvas and its context stay:
    // tearing them down on screen flashed a white square.
    act(() => { vi.advanceTimersByTime(3000); });
    const drawsAsleep = ctx.calls.draw;
    act(() => { vi.advanceTimersByTime(1000); });
    expect(ctx.calls.draw).toBe(drawsAsleep);
    expect(screen.getByTestId('monkey-aura').getAttribute('data-on')).toBe('false');
    expect(ctx.calls.lose ?? 0).toBe(0);
    act(() => setAssistantPhase('listening'));
    act(() => { vi.advanceTimersByTime(300); });
    expect(ctx.calls.draw).toBeGreaterThan(drawsAsleep!);
    unmount();
    expect(ctx.calls.lose).toBeGreaterThanOrEqual(1);
  });

  it('is sized to reach beyond the monkey and is invisible to assistive tech', () => {
    render(<MonkeyAura size={40} />);
    act(() => setAssistantPhase('speaking'));
    const canvas = screen.getByTestId('monkey-aura');
    expect(canvas.style.width).toBe('136px');
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
  });

  it('falls back to a plain ring where WebGL is missing', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => null) as never);
    render(<MonkeyAura size={36} />);
    act(() => setAssistantPhase('listening'));
    const ring = screen.getByTestId('monkey-aura-fallback');
    expect(ring.getAttribute('data-on')).toBe('true');
    act(() => setAssistantPhase('idle'));
    expect(screen.getByTestId('monkey-aura-fallback').getAttribute('data-on')).toBe('false');
  });
});
