import { useEffect, useRef, useState } from 'react';
import { AURA_FRAG, AURA_VERT, auraDrive, hexToRgb } from '../../runtime/assistant/aura-shader';
import { resolveAuraTones } from '../../runtime/assistant/aura-colors';
import { damp } from '../../runtime/assistant/monkey-motion';
import { useVoicePrefs } from '../../state/assistant-prefs';
import { getAssistantLevel, getAssistantPhase, useAssistantPhase } from '../../state/assistant-voice-store';
import styles from './MonkeyAura.module.css';

/** The canvas reaches this many times the monkey's width, so the drop never clips. */
const REACH = 3.4;

/**
 * A thin liquid drop of light around the monkey while the assistant listens,
 * thinks or speaks. It follows the voice when speaking. Sits inside the
 * monkey's wrapper, behind it. Draws nothing, and runs no loop, when idle.
 */
export function MonkeyAura({
  size,
  intensity = 1,
  spread = 1,
}: {
  size: number;
  /** Opacity of the whole drop, 0..1. */
  intensity?: number;
  /** How far the drop reaches past the monkey, as a multiple of its usual reach. */
  spread?: number;
}) {
  const phase = useAssistantPhase();
  const prefs = useVoicePrefs();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tones = resolveAuraTones(prefs.auraPreset, prefs.auraColor);
  const tonesRef = useRef(tones);
  tonesRef.current = tones;
  const [webgl, setWebgl] = useState(true);
  const active = phase !== 'idle';
  // Mounted once the assistant first wakes, then kept: the GL context lives as
  // long as the canvas. Tearing a context down while its canvas was still on
  // screen flashed a blank white square at the end of a conversation.
  const [mounted, setMounted] = useState(active);
  useEffect(() => {
    if (active) setMounted(true);
  }, [active]);
  const startRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mounted) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const css = Math.round(size * REACH * Math.max(0.7, spread));
    canvas.width = css * dpr;
    canvas.height = css * dpr;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) {
      setWebgl(false);
      return undefined;
    }

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, AURA_VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, AURA_FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setWebgl(false);
      return undefined;
    }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.viewport(0, 0, canvas.width, canvas.height);

    const u = (name: string) => gl.getUniformLocation(program, name);
    gl.uniform2f(u('uRes'), canvas.width, canvas.height);
    gl.uniform1f(u('uDpr'), dpr);
    gl.uniform2f(u('uCenter'), css / 2, css / 2);
    gl.uniform1f(u('uRadius'), size / 2);
    gl.uniform1f(u('uSpread'), spread);
    const uTime = u('uTime');
    const uLevel = u('uLevel');
    const uAmp = u('uAmp');
    const uAlive = u('uAlive');

    const reduced =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let running = false;
    let last = performance.now();
    let time = 0;
    let level = 0;
    let amp = 0.05;
    let alive = 0;
    let colored = '';

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const drive = auraDrive(getAssistantPhase(), getAssistantLevel(), now);
      // The voice is eased so the drop swells with each syllable without flicker.
      level = damp(level, drive.level, drive.level > level ? 14 : 7, dt);
      amp = damp(amp, drive.amp, 8, dt);
      alive = damp(alive, drive.alive, 4, dt);
      time += dt * (reduced ? 0 : drive.speed);

      const key = tonesRef.current.join();
      if (key !== colored) {
        colored = key;
        const [c1, c2, c3] = tonesRef.current;
        gl.uniform3fv(u('uC1'), hexToRgb(c1));
        gl.uniform3fv(u('uC2'), hexToRgb(c2));
        gl.uniform3fv(u('uC3'), hexToRgb(c3));
      }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      // Faded out and asleep: leave a clear (transparent) frame and stop the loop.
      if (getAssistantPhase() === 'idle' && alive < 0.01) {
        alive = 0;
        running = false;
        return;
      }
      gl.uniform1f(uTime, time);
      gl.uniform1f(uLevel, level);
      gl.uniform1f(uAmp, amp);
      gl.uniform1f(uAlive, alive);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    startRef.current = start;
    if (getAssistantPhase() !== 'idle') start();

    return () => {
      startRef.current = null;
      cancelAnimationFrame(raf);
      // The canvas leaves the page with this cleanup, so freeing the context
      // here never shows on screen.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [mounted, size, spread]);

  useEffect(() => {
    if (active) startRef.current?.();
  }, [active]);

  if (!webgl) {
    return (
      <span
        className={styles.fallback}
        data-testid="monkey-aura-fallback"
        data-on={active ? 'true' : 'false'}
        aria-hidden="true"
        style={{ '--aura-a': tones[0], '--aura-b': tones[1] } as React.CSSProperties}
      />
    );
  }
  if (!mounted) return null;
  const css = Math.round(size * REACH * Math.max(0.7, spread));
  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      data-testid="monkey-aura"
      data-on={active ? 'true' : 'false'}
      aria-hidden="true"
      style={{ width: css, height: css, opacity: intensity }}
    />
  );
}
