import { useEffect, useId, useRef, type MutableRefObject } from 'react';
import {
  MOUTH_PATHS,
  POSES,
  blinkScale,
  createSyllableMouth,
  damp,
  gazeToward,
  leanedGaze,
  mouthGeometry,
  nextBlinkAt,
  nextGestureAt,
  type MonkeyState,
} from '../../runtime/assistant/monkey-motion';
import { setAssistantLevel } from '../../state/assistant-voice-store';
import styles from './AssistantMonkey.module.css';

export interface AssistantMonkeyProps {
  state?: MonkeyState;
  /** Width and height in px of the monkey's disc; the listening rings go beyond it. */
  size?: number;
  onClick?: () => void;
  /** What the button says to a screen reader. */
  label?: string;
  /**
   * Mouth openness 0..1 from the speech engine while speaking. Without it the
   * monkey times its own syllables.
   */
  mouthLevelRef?: MutableRefObject<number | null>;
  className?: string;
  /** Tells the shared store how open the mouth is, for the aura. Only the real assistant does this. */
  publishLevel?: boolean;
  /** The spreading rings while it listens. Off where the liquid aura carries listening. */
  rings?: boolean;
}

const RIPPLE_COUNT = 3;
const RIPPLE_PERIOD_MS = 3400;
const SETTLED = 0.004;

/**
 * The assistant's face: a white monkey on a dark disc with brows, ears, eyes that
 * follow the cursor, a mouth that talks in syllables, and rings that spread while
 * it listens. All motion is written straight to the SVG from one animation loop
 * (no React renders per frame), and the loop sleeps when nothing is moving.
 */
export function AssistantMonkey({
  state = 'idle',
  size = 36,
  onClick,
  label = 'Asistente',
  mouthLevelRef,
  className = '',
  publishLevel = false,
  rings: showRings = true,
}: AssistantMonkeyProps) {
  const clipId = `mk-clip-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const rootRef = useRef<HTMLButtonElement>(null);
  const headRef = useRef<SVGGElement>(null);
  const faceRef = useRef<SVGGElement>(null);
  const earLRef = useRef<SVGGElement>(null);
  const earRRef = useRef<SVGGElement>(null);
  const browLRef = useRef<SVGPathElement>(null);
  const browRRef = useRef<SVGPathElement>(null);
  const eyeLRef = useRef<SVGGElement>(null);
  const eyeRRef = useRef<SVGGElement>(null);
  const smileRef = useRef<SVGPathElement>(null);
  const mouthRef = useRef<SVGGElement>(null);
  const cavityRef = useRef<SVGEllipseElement>(null);
  const clipRef = useRef<SVGEllipseElement>(null);
  const tongueRef = useRef<SVGEllipseElement>(null);
  const ringsRef = useRef<SVGGElement>(null);

  const stateRef = useRef<MonkeyState>(state);
  const wakeRef = useRef<() => void>(() => {});
  const stateSinceRef = useRef(0);
  stateRef.current = state;

  useEffect(() => {
    stateSinceRef.current = performance.now();
    wakeRef.current();
  }, [state]);

  useEffect(() => {
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mouth = createSyllableMouth();
    const cur = {
      brow: 0, browR: 0, rotL: 0, rotR: 0, ear: 0, eyeScale: 1,
      gx: 0, gy: 0, open: 0, wide: 0, ripple: 0, winkScale: 1,
      tilt: 0, shift: 0, earLS: 1, earRS: 1, earRX: 0,
    };
    let tx = 0;
    let ty = 0;
    let rafId = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sleeping = false;
    let last = performance.now();
    let blinkAt = nextBlinkAt(last);
    let blinkStart = -1e9;
    let gestureAt = nextGestureAt(last);
    let winkUntil = 0;
    let rippleOrigin = performance.now();
    let lastPointer = last;
    let lastState: MonkeyState = stateRef.current;

    const set = (el: Element | null, name: string, value: string) => el?.setAttribute(name, value);

    // `requestAnimationFrame` is normally asynchronous. Where a host runs it
    // synchronously (some test environments), scheduling the next frame from
    // inside a frame would recurse forever, so a nested frame waits on a timer.
    let depth = 0;
    const schedule = () => {
      if (depth > 0) {
        timer = setTimeout(() => {
          timer = null;
          rafId = requestAnimationFrame(tick);
        }, 16);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };

    const wake = () => {
      if (!sleeping) return;
      sleeping = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      last = performance.now();
      schedule();
    };
    wakeRef.current = wake;

    const onPointerMove = (e: PointerEvent) => {
      lastPointer = performance.now();
      if (reduced || !rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      const [gx, gy] = gazeToward(
        e.clientX - (rect.left + rect.width / 2),
        e.clientY - (rect.top + rect.height / 2),
      );
      tx = gx;
      ty = gy;
      wake();
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
      wake();
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);

    function tick(now: number) {
      depth += 1;
      try {
        frame(now);
      } finally {
        depth -= 1;
      }
    }

    function frame(now: number) {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const current = stateRef.current;
      const pose = POSES[current];

      if (current !== lastState) {
        if (current === 'wink') winkUntil = now + 900;
        if (current === 'listen') rippleOrigin = now;
        if (current === 'speak') mouth.reset();
        lastState = current;
      }
      if (current === 'idle' && now > gestureAt) {
        winkUntil = now + 520;
        gestureAt = nextGestureAt(now);
      }
      if (now > blinkAt) {
        blinkStart = now;
        blinkAt = nextBlinkAt(now);
      }
      const blink = reduced ? 1 : blinkScale(now - blinkStart);
      const winking = now < winkUntil;

      const gaze: readonly [number, number] = pose.look
        ? pose.look
        : pose.lookBias
          ? leanedGaze([tx, ty], pose.lookBias)
          : [tx, ty];
      const lookX = gaze[0];
      const lookY = gaze[1];
      let delta = 0;
      const ease = (key: keyof typeof cur, target: number, rate: number) => {
        const next = damp(cur[key], target, rate, dt);
        delta += Math.abs(next - cur[key]);
        cur[key] = next;
      };
      ease('gx', lookX, 9);
      ease('gy', lookY, 9);
      ease('brow', pose.brow, 12);
      ease('browR', pose.browRight ?? pose.brow, 12);
      ease('rotL', pose.browRotLeft, 12);
      ease('rotR', pose.browRotRight, 12);
      ease('ear', pose.ear, 10);
      ease('eyeScale', pose.eyeScale, 14);
      ease('winkScale', winking ? 0.08 : 1, 30);
      ease('ripple', current === 'listen' ? 1 : 0, 6);
      ease('tilt', pose.headTilt ?? 0, 7);
      ease('shift', pose.faceShift ?? 0, 7);
      ease('earLS', pose.earScaleLeft ?? 1, 8);
      ease('earRS', pose.earScaleRight ?? 1, 8);
      ease('earRX', pose.earShiftRight ?? 0, 8);

      let openTarget = 0;
      let wideTarget = 0;
      if (pose.talk) {
        const external = mouthLevelRef?.current;
        if (typeof external === 'number') {
          openTarget = external;
          wideTarget = 0;
        } else {
          const s = mouth.sample(now);
          openTarget = s.open;
          wideTarget = s.wide;
        }
      } else if (pose.round) {
        openTarget = 0.7;
        wideTarget = -1;
      }
      ease('open', openTarget, pose.talk ? 15 : 12);
      ease('wide', wideTarget, 12);

      const px = (cur.gx * 1.9).toFixed(2);
      const py = (cur.gy * 1.7).toFixed(2);
      const es = cur.eyeScale;
      if (headRef.current) {
        headRef.current.style.transform = `rotate(${(cur.gx * 8 + cur.tilt).toFixed(1)}deg)`;
        headRef.current.style.transformOrigin = '20px 20px';
      }
      if (faceRef.current) {
        faceRef.current.style.transform = `translate(${(cur.gx * 2.4 + cur.shift).toFixed(2)}px, ${(cur.gy * 2.2).toFixed(2)}px)`;
      }
      if (eyeLRef.current) {
        eyeLRef.current.style.transform = `translate(${px}px, ${py}px) scale(${es.toFixed(3)}, ${(es * blink).toFixed(3)})`;
      }
      if (eyeRRef.current) {
        eyeRRef.current.style.transform = `translate(${px}px, ${py}px) scale(${es.toFixed(3)}, ${(es * blink * cur.winkScale).toFixed(3)})`;
      }
      if (browLRef.current) {
        browLRef.current.style.transform = `translateY(${cur.brow.toFixed(2)}px) rotate(${cur.rotL.toFixed(1)}deg)`;
      }
      if (browRRef.current) {
        const lift = winking ? cur.browR + 0.8 : cur.browR;
        browRRef.current.style.transform = `translateY(${lift.toFixed(2)}px) rotate(${cur.rotR.toFixed(1)}deg)`;
      }
      if (earLRef.current) {
        earLRef.current.style.transform = `translateY(${cur.ear.toFixed(2)}px) rotate(${(cur.ear * -2).toFixed(1)}deg) scale(${cur.earLS.toFixed(3)})`;
      }
      if (earRRef.current) {
        earRRef.current.style.transform = `translate(${cur.earRX.toFixed(2)}px, ${cur.ear.toFixed(2)}px) rotate(${(cur.ear * 2).toFixed(1)}deg) scale(${cur.earRS.toFixed(3)})`;
      }

      // The aura around the composer swells with the voice.
      // Only while it talks: while it listens, the level is the person's own voice.
      if (publishLevel && pose.talk) setAssistantLevel(cur.open);

      const g = mouthGeometry(cur.open, cur.wide, pose.round === true);
      set(mouthRef.current, 'opacity', g.visible ? '1' : '0');
      set(smileRef.current, 'opacity', g.visible ? '0' : '1');
      set(smileRef.current, 'd', MOUTH_PATHS[pose.mouth]);
      if (g.visible) {
        for (const el of [cavityRef.current, clipRef.current]) {
          set(el, 'rx', g.rx.toFixed(2));
          set(el, 'ry', g.ry.toFixed(2));
          set(el, 'cy', g.cy.toFixed(2));
        }
        set(tongueRef.current, 'rx', g.tongue.rx.toFixed(2));
        set(tongueRef.current, 'ry', g.tongue.ry.toFixed(2));
        set(tongueRef.current, 'cy', g.tongue.cy.toFixed(2));
      }

      const rings = ringsRef.current?.children;
      if (rings) {
        for (let i = 0; i < rings.length; i += 1) {
          const ph = ((now - rippleOrigin) / RIPPLE_PERIOD_MS + i / RIPPLE_COUNT) % 1;
          const alpha = cur.ripple * (ph < 0.15 ? ph / 0.15 : 1 - (ph - 0.15) / 0.85) * 0.7;
          const ring = rings[i]!;
          ring.setAttribute('r', (22 + ph * 10).toFixed(2));
          ring.setAttribute('opacity', Math.max(0, alpha).toFixed(3));
          ring.setAttribute('stroke-width', (1.6 - ph).toFixed(2));
        }
      }

      const settled =
        delta < SETTLED &&
        !pose.talk &&
        current !== 'listen' &&
        !winking &&
        now - lastPointer > 600 &&
        now - blinkStart > 200;
      if (settled) {
        sleeping = true;
        const wakeIn = Math.max(30, Math.min(blinkAt - now - 30, gestureAt - now, 1500));
        timer = setTimeout(wake, wakeIn);
        return;
      }
      schedule();
    }

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      if (timer) clearTimeout(timer);
      wakeRef.current = () => {};
      window.removeEventListener('pointermove', onPointerMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [mouthLevelRef, publishLevel]);

  return (
    <button
      ref={rootRef}
      type="button"
      className={`${styles.root} ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-label={label}
      data-testid="assistant-monkey"
      data-state={state}
      onClick={onClick}
    >
      <svg className={styles.svg} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
        <defs>
          <clipPath id={clipId}>
            <ellipse ref={clipRef} cx="20" cy="28" rx="2.6" ry="0.5" />
          </clipPath>
        </defs>
{showRings ? (
        <g ref={ringsRef} className={styles.ripples}>
          {Array.from({ length: RIPPLE_COUNT }, (_, i) => (
            <circle key={i} cx="20" cy="20" r="22" fill="none" stroke="var(--monkey-ripple)" strokeWidth="1.4" opacity="0" />
          ))}
        </g>
        ) : null}
        <circle cx="20" cy="20" r="20" fill="#17171a" />
        <g transform="translate(20 20) scale(0.82) translate(-20 -20)">
          <g ref={headRef}>
            <g ref={earLRef} className={styles.part}>
              <circle cx="6.5" cy="21" r="6" fill="#ffffff" />
              <circle cx="6.5" cy="21" r="3" fill="#d4d4d9" />
            </g>
            <g ref={earRRef} className={styles.part}>
              <circle cx="33.5" cy="21" r="6" fill="#ffffff" />
              <circle cx="33.5" cy="21" r="3" fill="#d4d4d9" />
            </g>
            <circle cx="20" cy="20" r="15" fill="#ffffff" />
            <g ref={faceRef}>
              <circle cx="14.5" cy="18" r="5.6" fill="#dedee3" />
              <circle cx="25.5" cy="18" r="5.6" fill="#dedee3" />
              <ellipse cx="20" cy="25.5" rx="9" ry="7" fill="#dedee3" />
              <path ref={browLRef} className={styles.part} d="M11.6 13.4 Q14.5 12 17.4 13.4" stroke="#141416" strokeWidth="0.9" strokeLinecap="round" fill="none" />
              <path ref={browRRef} className={styles.part} d="M22.6 13.4 Q25.5 12 28.4 13.4" stroke="#141416" strokeWidth="0.9" strokeLinecap="round" fill="none" />
              <g ref={eyeLRef} className={styles.part}>
                <circle cx="14.5" cy="18" r="2" fill="#141416" />
                <circle cx="15.2" cy="17.3" r="0.6" fill="#ffffff" />
              </g>
              <g ref={eyeRRef} className={styles.part}>
                <circle cx="25.5" cy="18" r="2" fill="#141416" />
                <circle cx="26.2" cy="17.3" r="0.6" fill="#ffffff" />
              </g>
              <circle cx="18.3" cy="23" r="0.7" fill="#141416" />
              <circle cx="21.7" cy="23" r="0.7" fill="#141416" />
              <path ref={smileRef} d={MOUTH_PATHS.smile} stroke="#141416" strokeWidth="1.5" strokeLinecap="round" fill="none" />
              <g ref={mouthRef} opacity="0">
                <ellipse ref={cavityRef} cx="20" cy="28" rx="2.6" ry="0.5" fill="#141416" />
                <ellipse ref={tongueRef} cx="20" cy="29" rx="1.6" ry="0.8" fill="#e07f86" clipPath={`url(#${clipId})`} />
              </g>
            </g>
          </g>
        </g>
      </svg>
    </button>
  );
}
