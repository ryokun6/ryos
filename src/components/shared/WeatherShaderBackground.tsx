import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { WeatherFamily } from "@/utils/dynamicWallpaper";

/**
 * Render at full CSS-pixel resolution so the thin rain streaks stay crisp.
 * Combined with a capped device-pixel-ratio multiplier (below) this keeps the
 * precipitation sharp without paying for the native DPR on hi-dpi displays.
 */
const RENDER_SCALE = 1.0;
/** Upper bound on the device-pixel-ratio multiplier applied to the buffer. */
const MAX_PIXEL_RATIO = 1.5;
/** Cap the shader loop to reduce steady-state GPU usage. */
const TARGET_FPS = 30;
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS;

type RGB = [number, number, number];

interface WeatherShaderBackgroundProps {
  family: WeatherFamily;
  isDay: boolean;
  /** Base sky gradient colors (top → mid → bottom), each RGB in 0..1. */
  topColor: RGB;
  midColor: RGB;
  bottomColor: RGB;
  isActive?: boolean;
  className?: string;
}

const FAMILY_TO_INT: Record<WeatherFamily, number> = {
  clear: 0,
  partlyCloudy: 1,
  fog: 2,
  drizzle: 3,
  rain: 4,
  snow: 5,
  thunderstorm: 6,
};

const vertexShader = `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`;

// Procedural weather sky. The base vertical gradient matches the CSS weather
// gradient (top → mid → bottom). Clouds, precipitation, fog, stars and
// lightning are layered on top, keyed off the `family` int so a single program
// renders every condition.
const fragmentShader = `
  precision highp float;

  uniform vec2 resolution;
  uniform float time;
  uniform vec3 topColor;
  uniform vec3 midColor;
  uniform vec3 bottomColor;
  uniform float family;   // 0 clear,1 partlyCloudy,2 fog,3 drizzle,4 rain,5 snow,6 thunderstorm
  uniform float isDay;    // 1.0 day, 0.0 night

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i),                  hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  bool isFamily(float f) {
    return abs(family - f) < 0.5;
  }

  // One depth layer of falling precipitation as a 2D scattered-cell field.
  // p is aspect-corrected cell space; the field scrolls downward over time so
  // each cell holds one hashed particle that falls. Each particle sits at a
  // randomized sub-cell (x,y) and is drawn as an ellipse with x radius halfW and
  // y radius headLen: halfW << headLen gives a thin rain streak, halfW ~ headLen
  // gives a round snow flake. sway adds a per-particle horizontal drift (snow).
  // Neighbor cells above/below are sampled so particles crossing a cell boundary
  // are not clipped. Randomizing both axes per cell avoids fixed vertical lanes.
  float precipLayer(
    vec2 p, float t, float seed, float speed, float halfW, float headLen,
    float thresh, float sway, vec2 cellPix
  ) {
    p.y += t * speed;
    vec2 cellId = floor(p);
    vec2 f = fract(p);
    float edge = halfW + abs(sway) + 0.03;
    float acc = 0.0;
    for (int j = -1; j <= 1; j++) {
      float fj = float(j);
      vec2 cid = cellId + vec2(0.0, fj);
      float present = step(thresh, hash(cid + vec2(seed, seed * 1.7)));
      float ph = hash(cid + vec2(seed + 6.3, 3.1));
      vec2 pos = vec2(
        edge + (1.0 - 2.0 * edge) * hash(cid + vec2(seed + 1.3, 9.1)),
        hash(cid + vec2(seed + 2.7, 4.3))
      );
      pos.x += sin(t * 0.7 + ph * 6.2831) * sway;
      float hl = headLen * (0.6 + 0.8 * hash(cid + vec2(seed + 3.9, 7.7)));
      float bright = 0.4 + 0.75 * hash(cid + vec2(seed + 5.1, 2.2));
      vec2 d = (f - vec2(0.0, fj)) - pos;
      float dx = d.x / halfW;
      float dy = d.y / hl;
      float r = sqrt(dx * dx + dy * dy);
      // Edge softness sized to one screen pixel (analytic, resolution-aware) so
      // very thin streaks stay smooth instead of aliasing into blocks.
      float gx = dx * cellPix.x / halfW;
      float gy = dy * cellPix.y / hl;
      float aa = max(sqrt(gx * gx + gy * gy) / max(r, 1e-4), 1e-4);
      float prof = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
      acc += present * prof * bright;
    }
    return acc;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy; // y up, (0,0) bottom-left
    float aspect = resolution.x / resolution.y;

    // --- Base sky gradient (matches getWeatherGradientColors: top 0%, mid 55%) ---
    vec3 sky;
    if (uv.y > 0.45) {
      sky = mix(midColor, topColor, (uv.y - 0.45) / 0.55);
    } else {
      sky = mix(bottomColor, midColor, uv.y / 0.45);
    }
    vec3 col = sky;

    bool storm = isFamily(6.0);
    bool isRain = isFamily(4.0);
    bool isDrizzle = isFamily(3.0);
    bool isSnow = isFamily(5.0);
    bool isFog = isFamily(2.0);
    bool isPartly = isFamily(1.0);
    bool isClear = isFamily(0.0);

    // --- Clouds: drifting FBM, denser in the upper sky, coverage by family ---
    float coverage = 0.0;
    if (isClear) coverage = 0.06;
    else if (isPartly) coverage = 0.42;
    else if (isFog) coverage = 0.35;
    else if (isDrizzle) coverage = 0.6;
    else if (isRain) coverage = 0.72;
    else if (isSnow) coverage = 0.5;
    else if (storm) coverage = 0.85;

    vec2 cp = vec2(uv.x * aspect, uv.y);
    float clouds = fbm(cp * 2.2 + vec2(time * 0.018, time * 0.004));
    // Add a faster, smaller detail layer so edges churn a little.
    clouds = clouds * 0.8 + fbm(cp * 5.0 - vec2(time * 0.03, 0.0)) * 0.2;
    float lo = 1.0 - coverage - 0.18;
    float hi = 1.0 - coverage + 0.22;
    float cloudMask = smoothstep(lo, hi, clouds);
    // Clouds sit in the sky, thinning toward the horizon.
    cloudMask *= smoothstep(0.05, 0.55, uv.y);

    vec3 cloudCol;
    if (storm) {
      cloudCol = isDay > 0.5 ? vec3(0.34, 0.35, 0.4) : vec3(0.13, 0.13, 0.18);
    } else if (isRain || isDrizzle) {
      cloudCol = isDay > 0.5 ? vec3(0.72, 0.74, 0.78) : vec3(0.3, 0.32, 0.38);
    } else if (isSnow) {
      cloudCol = isDay > 0.5 ? vec3(0.86, 0.88, 0.92) : vec3(0.42, 0.45, 0.52);
    } else {
      cloudCol = isDay > 0.5 ? vec3(0.96, 0.97, 1.0) : vec3(0.5, 0.52, 0.6);
    }
    float cloudOpacity = (isPartly || isClear) ? 0.7 : 0.82;
    col = mix(col, cloudCol, cloudMask * cloudOpacity);

    // --- Fog: large soft drifting wash over the whole frame ---
    if (isFog) {
      float fogN = fbm(cp * 1.3 + vec2(time * 0.012, time * 0.006));
      vec3 fogCol = isDay > 0.5 ? vec3(0.82, 0.83, 0.85) : vec3(0.32, 0.34, 0.38);
      float fogAmt = 0.45 + 0.25 * fogN;
      // Heavier near the ground, lighter up high.
      fogAmt *= mix(1.0, 0.55, uv.y);
      col = mix(col, fogCol, fogAmt);
    }

    // --- Stars: fine soft pinpoints for a clear night sky ---
    // Each cell holds at most one star, placed at a hashed sub-cell position and
    // drawn with a distance-based smoothstep (tiny core + faint glow) so it reads
    // as an anti-aliased point rather than a hard upscaled pixel block.
    if (isClear && isDay < 0.5) {
      vec2 sp = vec2(uv.x * aspect, uv.y) * 64.0;
      vec2 id = floor(sp);
      float r = hash(id);
      float present = step(0.92, r);
      vec2 off = vec2(hash(id + 1.7), hash(id + 4.3)) - 0.5;
      vec2 gv = (fract(sp) - 0.5) - off * 0.7;
      float d = length(gv);
      float bright = 0.35 + 0.65 * hash(id + 8.9);
      float tw = 0.7 + 0.3 * sin(time * 1.6 + r * 120.0);
      float core = smoothstep(0.11, 0.0, d);
      float glow = smoothstep(0.34, 0.0, d) * 0.22;
      float star = (core + glow) * present * bright * tw;
      star *= smoothstep(0.2, 0.72, uv.y);
      col += vec3(star) * 0.9;
    }

    // --- Rain / drizzle: thin elongated streaks across 3 parallax layers ---
    // Each layer is a 2D scattered-cell field (no lanes) where every drop is a
    // slim vertical ellipse (small halfW, tall headLen) so it reads as a fast
    // motion-blurred streak. Near layers bigger/faster/brighter, far finer/dimmer.
    if (isRain || isDrizzle || storm) {
      // Mid-layer base parameters per family. cells = vertical cell count
      // (more = finer/denser); thresh = how sparse drops are. halfW is kept tiny
      // and headLen large so drops are thin and tall.
      float baseCells = isDrizzle ? 16.0 : (storm ? 20.0 : 18.0);
      float baseSpeed = isDrizzle ? 6.0 : (storm ? 15.0 : 11.0);
      float baseThresh = isDrizzle ? 0.92 : (storm ? 0.55 : 0.68);
      float baseHalfW = isDrizzle ? 0.012 : (storm ? 0.024 : 0.018);
      float baseHead = isDrizzle ? 0.16 : (storm ? 0.46 : 0.36);
      float baseTilt = isDrizzle ? 0.06 : (storm ? 0.14 : 0.1);
      float strength = isDrizzle ? 0.08 : (storm ? 0.22 : 0.16);

      float acc = 0.0;
      for (int i = 0; i < 3; i++) {
        float fl = float(i);
        float near = fl * 0.5; // 0 = far, 1 = near
        float cells = baseCells * mix(1.5, 0.85, near);
        float speed = baseSpeed * mix(0.7, 1.35, near);
        float halfW = baseHalfW * mix(0.7, 1.4, near);
        float headLen = baseHead * mix(0.8, 1.3, near);
        float opacity = mix(0.4, 1.0, near);
        float tilt = baseTilt * mix(0.8, 1.2, near);
        vec2 cp = vec2(uv.x * aspect, uv.y);
        cp.x += cp.y * tilt;
        cp += vec2(fl * 3.17, fl * 1.93); // de-align layers
        vec2 p = cp * cells;
        vec2 cellPix = vec2(cells * aspect / resolution.x, cells / resolution.y);
        float seed = 11.0 + fl * 23.0;
        acc += precipLayer(
          p, time, seed, speed, halfW, headLen, baseThresh, 0.0, cellPix
        ) * opacity;
      }
      // Denser in the upper/middle sky, dissolving before the very bottom.
      float fade = smoothstep(0.0, 0.34, uv.y);
      float rain = clamp(acc, 0.0, 1.0) * strength * fade;
      col += vec3(rain) * (isDay > 0.5 ? 0.6 : 0.45);
    }

    // --- Snow: round soft flakes that fall slowly and sway, 3 parallax layers ---
    // Same scattered-cell field as rain, but round (halfW ~ headLen), slow, with
    // a gentle per-flake horizontal sway. Near flakes bigger/faster, far smaller.
    if (isSnow) {
      float acc = 0.0;
      for (int i = 0; i < 3; i++) {
        float fl = float(i);
        float near = fl * 0.5; // 0 = far, 1 = near
        float cells = 24.0 * mix(1.7, 0.8, near);
        float speed = 1.4 * mix(0.65, 1.4, near);
        float radius = 0.02 * mix(0.7, 1.4, near);
        float sway = 0.12 * mix(0.8, 1.3, near);
        vec2 cp = vec2(uv.x * aspect, uv.y);
        cp += vec2(fl * 2.71, fl * 1.37); // de-align layers
        vec2 p = cp * cells;
        vec2 cellPix = vec2(cells * aspect / resolution.x, cells / resolution.y);
        float seed = 17.0 + fl * 29.0;
        acc += precipLayer(
          p, time, seed, speed, radius, radius, 0.78, sway, cellPix
        ) * mix(0.5, 1.0, near);
      }
      float snow = clamp(acc, 0.0, 1.0);
      col += vec3(snow) * (isDay > 0.5 ? 0.95 : 0.8);
    }

    // --- Thunderstorm: occasional pseudo-random full-frame lightning flash ---
    if (storm) {
      float seg = floor(time * 0.8);
      float r = hash(vec2(seg, 13.0));
      float local = fract(time * 0.8);
      float flash = 0.0;
      if (r > 0.82) {
        flash += exp(-local * 9.0) * 0.55;
        flash += exp(-abs(local - 0.12) * 22.0) * 0.3; // quick second strike
      }
      col += vec3(0.9, 0.92, 1.0) * flash;
    }

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

/**
 * A procedural, animated weather sky rendered on a full-screen Three.js quad.
 * Draws the time-of-day gradient plus drifting clouds, rain/drizzle/snow, fog,
 * stars and lightning depending on `family`. Modeled on {@link AmbientBackground}
 * for performance (low internal resolution, capped FPS, full GL teardown). If a
 * WebGL context can't be created it renders nothing and the caller's CSS
 * gradient remains visible underneath.
 */
export function WeatherShaderBackground({
  family,
  isDay,
  topColor,
  midColor,
  bottomColor,
  isActive = true,
  className = "",
}: WeatherShaderBackgroundProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  // Latest weather props, read by the render loop each frame. Using a ref (not
  // an effect) means the shader always reflects the current props regardless of
  // effect ordering — in particular when the live weather code resolves after
  // the first mount, the very next frame picks it up without a remount.
  const propsRef = useRef({ family, isDay, topColor, midColor, bottomColor });
  propsRef.current = { family, isDay, topColor, midColor, bottomColor };

  useEffect(() => {
    if (!isActive || !mountRef.current) return;

    const el = mountRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      // No WebGL: caller's CSS gradient stays visible underneath.
      return;
    }

    renderer.setPixelRatio(1);
    // Fall back to the viewport if the element hasn't been laid out yet, so a
    // 0-size first paint can't leave the renderer stuck at a 1×1 buffer. The
    // effective scale folds in a capped DPR so streaks are crisp on hi-dpi.
    const measure = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const eff = RENDER_SCALE * dpr;
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || window.innerHeight;
      return {
        w: Math.max(1, Math.floor(w * eff)),
        h: Math.max(1, Math.floor(h * eff)),
      };
    };
    const init = measure();
    renderer.setSize(init.w, init.h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    el.appendChild(renderer.domElement);

    const p0 = propsRef.current;
    const shaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        resolution: { value: new THREE.Vector2(init.w, init.h) },
        time: { value: 0.0 },
        topColor: { value: new THREE.Vector3().fromArray(p0.topColor) },
        midColor: { value: new THREE.Vector3().fromArray(p0.midColor) },
        bottomColor: { value: new THREE.Vector3().fromArray(p0.bottomColor) },
        family: { value: FAMILY_TO_INT[p0.family] },
        isDay: { value: p0.isDay ? 1.0 : 0.0 },
      },
      vertexShader,
      fragmentShader,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(geometry, shaderMaterial);
    scene.add(quad);

    const handleResize = () => {
      const { w, h } = measure();
      const res = shaderMaterial.uniforms.resolution.value as THREE.Vector2;
      if (res.x === w && res.y === h) return;
      renderer.setSize(w, h, false);
      res.set(w, h);
      renderer.render(scene, camera);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(el);

    let frameId = 0;
    let lastRenderAt = 0;
    const animate = (now: number) => {
      frameId = requestAnimationFrame(animate);
      if (lastRenderAt !== 0 && now - lastRenderAt < FRAME_INTERVAL_MS) return;
      lastRenderAt = now;
      const p = propsRef.current;
      const u = shaderMaterial.uniforms;
      u.time.value = now / 1000;
      u.family.value = FAMILY_TO_INT[p.family];
      u.isDay.value = p.isDay ? 1.0 : 0.0;
      u.topColor.value.set(p.topColor[0], p.topColor[1], p.topColor[2]);
      u.midColor.value.set(p.midColor[0], p.midColor[1], p.midColor[2]);
      u.bottomColor.value.set(
        p.bottomColor[0],
        p.bottomColor[1],
        p.bottomColor[2]
      );
      renderer.render(scene, camera);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      if (renderer.domElement.parentNode === el) {
        el.removeChild(renderer.domElement);
      }
      scene.remove(quad);
      geometry.dispose();
      shaderMaterial.dispose();
      renderer.dispose();
    };
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div
      ref={mountRef}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
      }}
    />
  );
}
