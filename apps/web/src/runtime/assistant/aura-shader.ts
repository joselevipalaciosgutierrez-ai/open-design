import type { AssistantPhase } from '../../state/assistant-voice-store';

/**
 * The liquid aura around the monkey, as a fragment shader plus the little
 * function that decides how lively it is. A thin drop of colour: calm and
 * breathing while the assistant listens, rippling with the voice while it
 * speaks, never thick enough to crowd the buttons beside the monkey.
 * Colours are passed in; nothing here knows the theme.
 */

export const AURA_VERT = 'attribute vec2 position;void main(){gl_Position=vec4(position,0.0,1.0);}';

const NOISE =
  'vec3 hash33(vec3 p3){p3=fract(p3*vec3(0.1031,0.11369,0.13787));p3+=dot(p3,p3.yxz+19.19);return -1.0+2.0*fract(vec3(p3.x+p3.y,p3.x+p3.z,p3.y+p3.z)*p3.zyx);}' +
  'float snoise3(vec3 p){const float K1=0.333333333;const float K2=0.166666667;vec3 i=floor(p+(p.x+p.y+p.z)*K1);vec3 d0=p-(i-(i.x+i.y+i.z)*K2);vec3 e=step(vec3(0.0),d0-d0.yzx);vec3 i1=e*(1.0-e.zxy);vec3 i2=1.0-e.zxy*(1.0-e);vec3 d1=d0-(i1-K2);vec3 d2=d0-(i2-K1);vec3 d3=d0-0.5;vec4 h=max(0.6-vec4(dot(d0,d0),dot(d1,d1),dot(d2,d2),dot(d3,d3)),0.0);vec4 n=h*h*h*h*vec4(dot(d0,hash33(i)),dot(d1,hash33(i+i1)),dot(d2,hash33(i+i2)),dot(d3,hash33(i+1.0)));return dot(vec4(31.316),n);}';

/** `uRadius` is the monkey's own radius in CSS px; the drop is drawn around it. */
export const AURA_FRAG =
  'precision highp float;uniform vec2 uRes;uniform float uTime,uLevel,uAmp,uAlive,uRadius,uDpr,uSpread;uniform vec2 uCenter;uniform vec3 uC1,uC2,uC3;' +
  NOISE +
  'void main(){' +
  'vec2 p=gl_FragCoord.xy/uDpr-uCenter;float t=uTime;float ang=atan(p.y,p.x);vec2 dir=normalize(p+1e-5);' +
  'float w=snoise3(vec3(dir*0.85,t))*0.75+snoise3(vec3(dir*1.5,t*1.3+7.0))*0.3;' +
  'float Rb=uRadius*(1.0+(0.5+0.4*uLevel)*uSpread)*(1.0+uAmp*uSpread*w);' +
  'float dist=length(p)-Rb;float mask=1.0-smoothstep(-1.0,2.5,dist);' +
  'float glow=exp(-max(dist,0.0)/7.0)*0.18;' +
  'float n2=snoise3(vec3(p/uRadius*0.9,t*0.8))*0.5+0.5;' +
  'vec3 col=mix(uC1,uC2,clamp(0.5+0.5*sin(ang+t+n2*3.0),0.0,1.0));' +
  'col=mix(col,uC3,smoothstep(0.3,1.0,length(p)/Rb)*0.55);col=clamp(mix(vec3(dot(col,vec3(0.33))),col,1.35),0.0,1.0);' +
    'float a=max(mask*0.96,glow*(1.0-mask))*uAlive;' +
  'gl_FragColor=vec4(col*a,a);}';

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export interface AuraDrive {
  /** 0 hidden .. 1 fully shown. */
  alive: number;
  /** 0..1: how far the drop swells beyond its calm size. */
  level: number;
  /** How much the edge wobbles. */
  amp: number;
  /** How fast the drop moves, as a multiple of its calm pace. */
  speed: number;
}

/**
 * What the drop should look like right now. Listening is alive but contained:
 * a steady breath that stirs with the person's voice. Thinking is dimmer. Speaking follows the voice (`voice`, 0..1):
 * it swells, wobbles harder and moves faster with each syllable, but within
 * limits that keep it a halo and not a cloud. While listening, `voice` is the
 * person's own voice from the microphone, so the liquid moves when they talk.
 */
export function auraDrive(phase: AssistantPhase, voice: number, now: number): AuraDrive {
  const v = Math.max(0, Math.min(1, voice));
  switch (phase) {
    case 'listening':
      // Alive on its own, and answering the person's own voice: it moves when you talk.
      return { alive: 1, level: Math.min(1, 0.12 + 0.04 * Math.sin(now / 800) + 0.6 * v), amp: 0.1 + 0.18 * v, speed: 0.6 + 1.4 * v };
    case 'speaking':
      return { alive: 1, level: v, amp: 0.07 + 0.2 * v, speed: 0.8 + 1.6 * v };
    case 'transcribing':
    case 'thinking':
      return { alive: 0.55, level: 0.1, amp: 0.04, speed: 0.25 };
    default:
      return { alive: 0, level: 0, amp: 0.04, speed: 0.3 };
  }
}
