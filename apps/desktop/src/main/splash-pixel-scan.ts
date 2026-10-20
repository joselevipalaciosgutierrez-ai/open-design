// Startup splash artwork: the SAME pixel-scan wordmark the Home hero runs
// (apps/web/src/components/home-hero/pixel-scan/engine.ts), ported to plain
// WebGL so it can render in the splash window.
//
// Why a port instead of importing the web one: the splash is shown BEFORE the
// web sidecar boots, so there is no HTTP origin to load a bundle, `three`, or
// the logo SVG from — everything here has to be inlined into the main-process
// HTML string. The web engine only uses `three` as a fullscreen-quad wrapper
// (one RawShaderMaterial), so the port is the same shader verbatim plus ~80
// lines of raw GL setup.
//
// The fragment/vertex shaders below are COPIED from that engine — keep them in
// sync when the effect changes there (regenerate with the snippet in
// `scripts/` or by hand; they are pasted verbatim, no edits).
//
// Differences from the Home hero, all deliberate:
//   • no pointer interaction (nothing to hover on a splash) — the cursor
//     uniforms stay parked off-canvas and the trail weights stay 0;
//   • the entrance sweep LOOPS (sweep → hold on the assembled logo → sweep
//     again) instead of running once, because the splash has to keep moving
//     for however long the boot takes;
//   • a 2D static-logo fallback if WebGL is unavailable, so the splash always
//     shows the wordmark.

/**
 * The Lev Design mark: the assistant's monkey (the same 40-unit face as
 * apps/web/src/components/assistant/AssistantMonkey.tsx, at rest) beside the
 * name. Kept at the old wordmark's 1705x291 so the host box and the shader's
 * texture keep their proportions. `dark` paints it for a black splash.
 */
export function splashLogoSvg(dark = false, wink = false): string {
  const ink = dark ? "#f2f2f2" : "#202020";
  const line = "#141416";
  // A flat 2D face about as tall as the "L": no disc, an outline carries it on
  // the light splash. `wink` closes the right eye and lifts its brow.
  const rightEye = wink
    ? `<path d="M23.6 18.2 Q25.5 19.6 27.4 18.2" stroke="${line}" stroke-width="1" stroke-linecap="round" fill="none"/>`
    : `<circle cx="25.5" cy="18" r="2" fill="${line}"/><circle cx="26.2" cy="17.3" r="0.6" fill="#ffffff"/>`;
  const rightBrow = wink ? "M22.6 12.6 Q25.5 11.2 28.4 12.6" : "M22.6 13.4 Q25.5 12 28.4 13.4";
  const monkey = `<g transform="translate(-4 -7) scale(6.7)">
    <circle cx="6.5" cy="21" r="6" fill="#ffffff" stroke="${ink}" stroke-width="1.1"/><circle cx="6.5" cy="21" r="3" fill="#d4d4d9"/>
    <circle cx="33.5" cy="21" r="6" fill="#ffffff" stroke="${ink}" stroke-width="1.1"/><circle cx="33.5" cy="21" r="3" fill="#d4d4d9"/>
    <circle cx="20" cy="20" r="15" fill="#ffffff" stroke="${ink}" stroke-width="1.1"/>
    <circle cx="14.5" cy="18" r="5.6" fill="#dedee3"/><circle cx="25.5" cy="18" r="5.6" fill="#dedee3"/>
    <ellipse cx="20" cy="25.5" rx="9" ry="7" fill="#dedee3"/>
    <path d="M11.6 13.4 Q14.5 12 17.4 13.4" stroke="${line}" stroke-width="0.9" stroke-linecap="round" fill="none"/>
    <path d="${rightBrow}" stroke="${line}" stroke-width="0.9" stroke-linecap="round" fill="none"/>
    <circle cx="14.5" cy="18" r="2" fill="${line}"/><circle cx="15.2" cy="17.3" r="0.6" fill="#ffffff"/>
    ${rightEye}
    <circle cx="18.3" cy="23" r="0.7" fill="${line}"/><circle cx="21.7" cy="23" r="0.7" fill="${line}"/>
    <path d="${wink ? "M16 27.8 Q20 29.4 24.6 26.4" : "M15.6 27 Q20 30.4 24.4 27"}" stroke="${line}" stroke-width="1.5" stroke-linecap="round" fill="none"/>
  </g>`;
  const name = `<text x="330" y="212" textLength="1335" lengthAdjust="spacingAndGlyphs" fill="${ink}"
    font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif"
    font-size="236" font-weight="600" letter-spacing="-4">Lev Design</text>`;
  return `<svg width="1705" height="291" viewBox="0 0 1705 291" fill="none" xmlns="http://www.w3.org/2000/svg">${monkey}${name}</svg>`;
}

export function splashLogoDataUrl(dark = false, wink = false): string {
  return `data:image/svg+xml;base64,${Buffer.from(splashLogoSvg(dark, wink), "utf8").toString("base64")}`;
}

/** The light mark, inlined (the splash has no server). */
export const SPLASH_LOGO_DATA_URL = splashLogoDataUrl(false);

const PIXEL_SCAN_VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
void main() { gl_Position = vec4(position, 1.0); }
`;

const PIXEL_SCAN_FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D src;
uniform vec2 resolution;
uniform vec2 offset;
uniform float time;
uniform float enterTime;
uniform float leaveTime;

uniform int mode;
uniform float speed;
uniform float delay;
uniform float width;
uniform vec3 accent;
uniform vec3 accent2;
uniform vec3 baseCol;
uniform vec2 mouse;
uniform float hover;
uniform float spot;

#define TRAIL 24
uniform vec2 trail[TRAIL];
uniform float trailW[TRAIL];

#define W width
#define LAYERS 3.0

vec4 readTex(vec2 uv) {
  if (uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1.) return vec4(0);
  return texture2D(src, uv);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(4859., 3985.))) * 3984.); }
float sdBox(vec2 p, float r) { vec2 q = abs(p) - r; return min(length(q), max(q.y, q.x)); }

float dir = 1.;
vec2 mp = vec2(0.);
vec2 tp[TRAIL];

vec2 pxToP(vec2 px) {
  vec2 uv = (px - offset) / resolution;
  vec2 q = uv * 2. - 1.;
  q.y *= resolution.y / resolution.x;
  return q;
}

float toRangeT(vec2 p, float scale) {
  float d;
  if (mode == 0) d = p.x / (scale * 2.) + .5;
  else if (mode == 1) d = 1. - (p.y / (scale * 2.) + .5);
  else if (mode == 2) d = length(p) / scale;

  else d = dot(p, vec2(0.7071, 0.7071)) / (scale * 2.) + .5;
  d = dir > 0. ? d : (1. - d);
  return d;
}

vec4 cell(vec2 p, vec2 pi, float scale, float t, float edge) {
  vec2 pc = pi + .5;

  vec2 uvc = pc / scale;
  uvc.y /= resolution.y / resolution.x;
  uvc = uvc * 0.5 + 0.5;
  if (uvc.x < 0. || uvc.x > 1. || uvc.y < 0. || uvc.y > 1.) return vec4(0);
  float alpha = smoothstep(.0, .1, texture2D(src, uvc).a);

  float x = toRangeT(pi, scale);
  float n = hash(pi);
  float SPREAD = W * 2.2;
  float anim = smoothstep(W * 2., .0, abs(x + n * SPREAD - t));

  vec2 cellP = pc / scale;
  float spotA = 0.;
  for (int i = 0; i < TRAIL; i++) {
    float w = trailW[i];
    if (w <= 0.) continue;
    vec2 rel = cellP - tp[i];
    float ang = atan(rel.y, rel.x);
    float wob = 1.
      + 0.30 * sin(3. * ang + time * 1.6)
      + 0.16 * sin(5. * ang - time * 1.1 + 1.3);
    float reach = spot * 0.8 * wob;
    spotA = max(spotA, smoothstep(reach, reach * 0.4, length(rel)) * w);
  }
  anim = max(anim, spotA * hover);

  float tone = 0.5 + 0.5 * sin(time * 2.0 + n * 6.2831)
                   + 0.18 * sin(time * 3.7 + n * 12.566);
  tone = clamp(tone, 0., 1.);
  vec3 cellAccent = mix(accent, accent2, tone);
  vec4 color = vec4(mix(baseCol, cellAccent, anim), 1.) * anim;

  float pull = hover * smoothstep(spot * 1.4, 0., length(cellP - mp));
  vec2 mag = normalize(mp - cellP + 1e-5) * pull * 0.18;
  vec2 bp = p - pc - mag;

  float sd = sdBox(bp, .38);
  color *= mix(1., clamp(.3 / abs(sd), 0., 10.), edge * pow(anim, 9.));
  color += vec4(cellAccent, 1.) * anim * smoothstep(.55, .0, abs(sd)) * 0.07;

  return color * alpha;
}

vec4 cellsColor(vec2 p, float scale, float t) {
  vec2 pi = floor(p);
  vec2 d = vec2(0, 1);
  vec4 cc = vec4(0);
  cc += cell(p, pi, scale, t, .2) * 4.;
  cc += cell(p, pi + d.xy, scale, t, .9);
  cc += cell(p, pi - d.xy, scale, t, .9);
  cc += cell(p, pi + d.yx, scale, t, .9);
  cc += cell(p, pi - d.yx, scale, t, .9);
  return cc / 8.;
}

vec4 draw(vec2 uv, vec2 p, float t, float scale) {
  vec4 c = readTex(uv);
  vec2 pi = floor(p * scale);
  float n = hash(pi);
  t = t * (1. + W * 4.) - W * 2.;
  float x = toRangeT(pi, scale);
  float a1 = smoothstep(t, t - W, x + n * W);
  c *= a1;
  c += cellsColor(p * scale, scale, t) * 1.1;
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - offset) / resolution;
  vec2 p = uv * 2. - 1.;
  p.y *= resolution.y / resolution.x;

  mp = pxToP(mouse);
  for (int i = 0; i < TRAIL; i++) tp[i] = pxToP(trail[i]);

  float t;
  if (leaveTime > 0.) { dir = -1.; t = clamp(leaveTime * speed, 0., 1.); }
  else { t = clamp((enterTime - delay) * speed, 0., 1.); }
  t = (fract(t * .99999) - 0.5) * dir + 0.5;

  for (float i = 0.; i < LAYERS; i++) {
    float s = cos(i) * 11. + 32.;
    gl_FragColor += draw(uv, p, t, abs(s));
  }
  gl_FragColor /= LAYERS;
  gl_FragColor *= smoothstep(0., 0.01, t);
}
`;

/** Layout for the wordmark host + canvas inside the splash body. */
export const SPLASH_PIXEL_SCAN_STYLE = `
      #splash-logo {
        position: relative;
        /* A 40px-tall wordmark (per product), width following the artwork's own
           proportions — it used to span 62% of the splash window, which read as
           a full-screen animation rather than a mark. */
        height: 40px;
        width: auto;
        /* The artwork is 1705x291; the host must share that ratio because the
           shader samples a texture rasterised to the host box. With a definite
           height this is also what resolves the width (≈234px). */
        aspect-ratio: 1705 / 291;
      }
      #splash-logo canvas {
        display: block;
        height: 100%;
        width: 100%;
      }
`;

export const SPLASH_PIXEL_SCAN_MARKUP = `
    <div id="splash-logo" role="img" aria-label="Lev Design">
      <canvas id="splash-canvas"></canvas>
    </div>
`;

/**
 * Inline renderer for the splash window. Vanilla ES5-ish on purpose: it runs
 * in a sandboxed `data:` document with no bundler and no polyfills.
 */
export function splashPixelScanScript(options: { dark?: boolean } = {}): string {
  return `
      (function () {
        var host = document.getElementById("splash-logo");
        var canvas = document.getElementById("splash-canvas");
        if (!host || !canvas) return;

        var LOGO_SRC = ${JSON.stringify(options.dark ? splashLogoDataUrl(true) : SPLASH_LOGO_DATA_URL)};
        // The same mark with the monkey winking: shown once, as the logo first comes together.
        var WINK_SRC = ${JSON.stringify(splashLogoDataUrl(options.dark === true, true))};
        var winkImg = new Image();
        winkImg.src = WINK_SRC;
        var WINK_AT = 0.25;
        var WINK_MS = 420;
        var winkState = 0; // 0 waiting, 1 winking, 2 done
        var VERT = ${JSON.stringify(PIXEL_SCAN_VERTEX_SHADER)};
        var FRAG = ${JSON.stringify(PIXEL_SCAN_FRAGMENT_SHADER)};

        // Same tuning the Home hero passes: brand greens, diagonal sweep
        // (mode 3), 0.2 band width.
        var ACCENT = [0.529, 0.918, 0.361];
        var ACCENT2 = [0.816, 1.0, 0.71];
        var BASE = [0.184, 0.471, 0.114];
        var TRAIL = 24;
        var ENTRANCE_SECONDS = 2.6;
        // Beat on the finished logo before the next sweep, so the loop reads as
        // "assembling again" rather than a strobe.
        var HOLD_SECONDS = 1.1;
        var MIN_ENTER = 0.06;

        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var img = new Image();
        var word = document.createElement("canvas");
        var gl = null;
        var program = null;
        var uni = {};
        var texture = null;
        var raf = 0;
        var startTime = 0;
        var cycleStart = 0;
        var stopped = false;

        function hostSize() {
          var rect = host.getBoundingClientRect();
          return {
            w: Math.max(1, Math.round(rect.width)),
            h: Math.max(1, Math.round(rect.height))
          };
        }

        // Contain-fit the artwork into the host box, exactly as the web engine
        // rasterises it — the shader reads this canvas as its glyph mask.
        function rasterise(size) {
          word.width = Math.max(1, Math.round(size.w * dpr));
          word.height = Math.max(1, Math.round(size.h * dpr));
          var ctx = word.getContext("2d");
          if (!ctx) return;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, size.w, size.h);
          var art = winkState === 1 && winkImg.naturalWidth > 0 ? winkImg : img;
          if (art.naturalWidth > 0 && art.naturalHeight > 0) {
            var s = Math.min(size.w / art.naturalWidth, size.h / art.naturalHeight);
            var dw = art.naturalWidth * s;
            var dh = art.naturalHeight * s;
            ctx.drawImage(art, (size.w - dw) / 2, (size.h - dh) / 2, dw, dh);
          }
        }

        var winkEnds = 0;
        function setWink(next) {
          winkState = next;
          rasterise({ w: sizedW, h: sizedH });
          uploadTexture();
        }

        function drawStatic() {
          var size = hostSize();
          if (size.w < 2 || size.h < 2) return;
          canvas.width = Math.max(1, Math.round(size.w * dpr));
          canvas.height = Math.max(1, Math.round(size.h * dpr));
          var ctx = null;
          try {
            ctx = canvas.getContext("2d");
          } catch (err) {
            ctx = null;
          }
          if (!ctx || !img.naturalWidth) return;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, size.w, size.h);
          var s = Math.min(size.w / img.naturalWidth, size.h / img.naturalHeight);
          var dw = img.naturalWidth * s;
          var dh = img.naturalHeight * s;
          ctx.drawImage(img, (size.w - dw) / 2, (size.h - dh) / 2, dw, dh);
        }

        function compile(type, source) {
          var shader = gl.createShader(type);
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error("[splash] shader compile failed:", gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
          }
          return shader;
        }

        function uploadTexture() {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          // three's CanvasTexture flips Y by default; the shader's uv comes from
          // gl_FragCoord (origin bottom-left), so without this the wordmark
          // renders upside down.
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, word);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }

        var sizedW = 0;
        var sizedH = 0;
        function resize() {
          var size = hostSize();
          // The host is an aspect-ratio box; on the first tick after parse its
          // rect can still be empty. Sizing the canvas to that would leave a
          // 1x1 buffer forever, so wait for a real box (the ResizeObserver
          // below calls back the moment layout produces one).
          if (size.w < 2 || size.h < 2) return;
          if (size.w === sizedW && size.h === sizedH) return;
          sizedW = size.w;
          sizedH = size.h;
          canvas.width = Math.max(1, Math.round(size.w * dpr));
          canvas.height = Math.max(1, Math.round(size.h * dpr));
          gl.viewport(0, 0, canvas.width, canvas.height);
          rasterise(size);
          uploadTexture();
          gl.uniform2f(uni.resolution, canvas.width, canvas.height);
        }

        function frame() {
          if (stopped) return;
          // Cheap every frame (it early-returns unless the box actually
          // changed) and it is what recovers a first paint that raced layout.
          resize();
          if (!sizedW) {
            raf = requestAnimationFrame(frame);
            return;
          }
          var now = performance.now();
          var elapsed = (now - cycleStart) / 1000;
          var enterTime;
          if (elapsed <= ENTRANCE_SECONDS) {
            var x = elapsed / ENTRANCE_SECONDS;
            // easeOutQuad, same curve the web engine uses for its entrance.
            var eased = 1 - (1 - x) * (1 - x);
            // Floor the ramp instead of starting at 0: the shader multiplies
            // its whole output by smoothstep(0, 0.01, t), so a literal 0 paints
            // an empty frame — once, on the web hero's mount, that is the
            // point; on a loop it is a blink every cycle. Starting just inside
            // means the next sweep opens with its leading blocks already lit.
            enterTime = MIN_ENTER + eased * (1 - MIN_ENTER);
          } else if (elapsed <= ENTRANCE_SECONDS + HOLD_SECONDS) {
            enterTime = 2;
            // Once the logo first stands assembled, the monkey winks.
            if (winkState === 0 && elapsed >= ENTRANCE_SECONDS + WINK_AT && winkImg.naturalWidth > 0) {
              winkEnds = now + WINK_MS;
              setWink(1);
            }
          } else {
            cycleStart = now;
            enterTime = MIN_ENTER;
          }
          if (winkState === 1 && now >= winkEnds) setWink(2);
          gl.uniform1f(uni.time, (now - startTime) / 1000);
          gl.uniform1f(uni.enterTime, enterTime);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          raf = requestAnimationFrame(frame);
        }

        function start() {
          try {
            // preserveDrawingBuffer: a splash frame can be composited outside
            // our rAF tick (window reveal, DPI change, a screenshot); without
            // it the compositor can pick up an already-swapped, empty buffer
            // and the wordmark blinks out mid-boot.
            gl = canvas.getContext("webgl", {
              alpha: true,
              antialias: false,
              premultipliedAlpha: true,
              preserveDrawingBuffer: true
            });
          } catch (err) {
            gl = null;
          }
          if (!gl) {
            drawStatic();
            return;
          }
          var vs = compile(gl.VERTEX_SHADER, VERT);
          var fs = compile(gl.FRAGMENT_SHADER, FRAG);
          if (!vs || !fs) {
            gl = null;
            drawStatic();
            return;
          }
          program = gl.createProgram();
          gl.attachShader(program, vs);
          gl.attachShader(program, fs);
          gl.linkProgram(program);
          if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error("[splash] program link failed:", gl.getProgramInfoLog(program));
            gl = null;
            drawStatic();
            return;
          }
          gl.useProgram(program);

          // Fullscreen quad — the whole scene the web engine builds with
          // three is one PlaneGeometry(2, 2).
          var buffer = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 0, 1, -1, 0, -1, 1, 0,
            -1, 1, 0, 1, -1, 0, 1, 1, 0
          ]), gl.STATIC_DRAW);
          var loc = gl.getAttribLocation(program, "position");
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);

          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

          var names = ["src", "resolution", "offset", "time", "enterTime", "leaveTime",
            "mode", "speed", "delay", "width", "accent", "accent2", "baseCol",
            "mouse", "hover", "spot"];
          for (var i = 0; i < names.length; i++) uni[names[i]] = gl.getUniformLocation(program, names[i]);
          uni.trail = gl.getUniformLocation(program, "trail[0]");
          uni.trailW = gl.getUniformLocation(program, "trailW[0]");

          texture = gl.createTexture();
          gl.activeTexture(gl.TEXTURE0);
          gl.uniform1i(uni.src, 0);

          gl.uniform2f(uni.offset, 0, 0);
          gl.uniform1f(uni.leaveTime, 0);
          gl.uniform1i(uni.mode, 3);
          gl.uniform1f(uni.speed, 1);
          gl.uniform1f(uni.delay, 0);
          gl.uniform1f(uni.width, 0.2);
          gl.uniform3f(uni.accent, ACCENT[0], ACCENT[1], ACCENT[2]);
          gl.uniform3f(uni.accent2, ACCENT2[0], ACCENT2[1], ACCENT2[2]);
          gl.uniform3f(uni.baseCol, BASE[0], BASE[1], BASE[2]);
          // No cursor on a splash: park it far away and leave every trail
          // sample cold, so the hover / spot uniforms contribute nothing.
          gl.uniform2f(uni.mouse, -10000, -10000);
          gl.uniform1f(uni.hover, 0);
          gl.uniform1f(uni.spot, 0.28);
          var trail = new Float32Array(TRAIL * 2);
          for (var t = 0; t < trail.length; t++) trail[t] = -10000;
          gl.uniform2fv(uni.trail, trail);
          gl.uniform1fv(uni.trailW, new Float32Array(TRAIL));

          resize();
          startTime = performance.now();
          cycleStart = startTime;
          raf = requestAnimationFrame(frame);
          window.addEventListener("resize", resize);
          if (typeof ResizeObserver === "function") {
            new ResizeObserver(function () { resize(); }).observe(host);
          }
          // A lost context on a splash is not recoverable by waiting: park the
          // static wordmark so the window never goes blank mid-boot, and pick
          // the shader back up if the GPU hands the context back.
          canvas.addEventListener("webglcontextlost", function (event) {
            event.preventDefault();
            stopped = true;
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
            gl = null;
            sizedW = 0;
            sizedH = 0;
            drawStatic();
          });
          canvas.addEventListener("webglcontextrestored", function () {
            stopped = false;
            start();
          });
        }

        img.onload = start;
        img.onerror = function () {
          console.error("[splash] logo failed to load");
        };
        img.src = LOGO_SRC;

        // The window is torn down when the app is ready, which stops this on
        // its own; the hook is here for a graceful stop before that.
        window.__odSplashStopLogo = function () {
          stopped = true;
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
        };
      })();
`;
}
