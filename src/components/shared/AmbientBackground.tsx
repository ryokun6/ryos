import { useRef, useEffect, useCallback } from "react";
import * as THREE from "three";

/** Duration of crossfade between cover textures (seconds) */
const CROSSFADE_SECONDS = 1.5;

export type AmbientVariant = "liquid" | "warp" | "vortex";

interface AmbientBackgroundProps {
  /** URL of the cover art to use as color source */
  coverUrl: string | null;
  /** Shader variant: "liquid" (Apple Music style), "warp" (Kali fractal), or "vortex" (volumetric vortex) */
  variant?: AmbientVariant;
  /** Whether the background should be active/animating */
  isActive?: boolean;
  className?: string;
}

// --- Shared vertex shader ---
const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// =====================================================================
// LIQUID – Apple Music-style noise-based UV warping with bloom & swirl
// =====================================================================
const liquidFragmentShader = `
  uniform vec2 resolution;
  uniform float time;
  uniform sampler2D coverTextureA;
  uniform sampler2D coverTextureB;
  uniform float blendFactor;
  varying vec2 vUv;

  const float DISTORTION = 0.22;
  const float SPEED      = 0.2;
  const float BLOOM      = 0.4;
  const float ZOOM       = 1.4;
  const float SWIRL      = 1.0;
  const float SATURATION = 1.4;
  const float BLUR       = 0.16;   // blur radius in UV space

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i),                   hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)),  hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
  float fbm(vec2 p) {
    return noise(p) * 0.5 + noise(p * 2.0) * 0.25 + noise(p * 4.0) * 0.125;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    float aspect = resolution.x / resolution.y;
    vec2 centered = (uv - 0.5) * vec2(aspect, 1.0);
    float t = time * SPEED;

    vec2 texUV = (uv - 0.5) / ZOOM + 0.5;
    texUV += vec2(sin(t * 0.7) * 0.015, cos(t * 0.5) * 0.015);

    vec2 nc = centered * 2.5 + t * 0.4;
    vec2 distort = (vec2(fbm(nc), fbm(nc + 73.0)) - 0.5) * DISTORTION;

    float dist = length(centered);
    float angle = dist * SWIRL * sin(t * 0.35);
    float ca = cos(angle), sa = sin(angle);
    distort = vec2(ca * distort.x - sa * distort.y,
                   sa * distort.x + ca * distort.y);

    texUV = clamp(texUV + distort, 0.002, 0.998);

    // Blur: 3 concentric rings (12 taps + center) – regular but no grid
    vec3 col = vec3(0.0);
    col += mix(texture2D(coverTextureA, texUV).rgb, texture2D(coverTextureB, texUV).rgb, blendFactor);
    float total = 1.0;
    for (int ring = 1; ring <= 3; ring++) {
      float r = BLUR * float(ring) / 3.0;
      float w = 1.0 / float(ring);          // inner rings weighted more
      int taps = ring * 4;                   // 4, 8, 12 taps per ring
      for (int i = 0; i < 12; i++) {
        if (i >= taps) break;
        float a = float(i) * 6.28318 / float(taps);
        vec2 sampleUV = clamp(texUV + vec2(cos(a), sin(a)) * r, 0.002, 0.998);
        col += mix(
          texture2D(coverTextureA, sampleUV).rgb,
          texture2D(coverTextureB, sampleUV).rgb,
          blendFactor
        ) * w;
        total += w;
      }
    }
    col /= total;

    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col += col * smoothstep(0.35, 1.0, luma) * BLOOM;

    float gray = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(gray), col, SATURATION);

    float vig = 1.0 - dot(centered * 0.7, centered * 0.7);
    col *= smoothstep(0.0, 1.0, vig);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

// =====================================================================
// WARP – Kali-fold fractal sampling cover art for deep nebula colors
// =====================================================================
const warpFragmentShader = `
  uniform vec2 resolution;
  uniform float time;
  uniform sampler2D coverTextureA;
  uniform sampler2D coverTextureB;
  uniform float blendFactor;
  varying vec2 vUv;

  void main() {
    float s = 0.0, v = 0.0;
    vec2 uv = (gl_FragCoord.xy / resolution.xy) * 2.0 - 1.0;
    float t = (time - 2.0) * 80.0;

    vec3 init = vec3(
      sin(t * 0.0032) * 0.3,
      0.35 - cos(t * 0.005) * 0.3,
      t * 0.002
    );

    vec3 col = vec3(0.0);
    for (int r = 0; r < 40; r++) {
      vec3 p = init + s * vec3(uv, 0.05);
      p.z = fract(p.z);

      for (int i = 0; i < 6; i++) {
        p = abs(p * 2.04) / dot(p, p) - 0.9;
      }

      v += pow(dot(p, p), 0.7) * 0.06;

      vec2 texUV = fract(p.xy * 0.15 + 0.5);
      vec3 texCol = mix(
        texture2D(coverTextureA, texUV).rgb,
        texture2D(coverTextureB, texUV).rgb,
        blendFactor
      );

      col += texCol * v * 0.005;
      s += 0.0625;
    }

    float gray = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(gray), col, 1.4);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

// =====================================================================
// VORTEX – Volumetric raymarched vortex tinted by cover art colors
// Based on Shadertoy technique: accumulate along ray with noise field
// =====================================================================
const vortexFragmentShader = `
  uniform vec2 resolution;
  uniform float time;
  uniform sampler2D coverTextureA;
  uniform sampler2D coverTextureB;
  uniform float blendFactor;
  varying vec2 vUv;

  // 2D rotation matrix
  vec2 rot(vec2 v, float t) {
    float s = sin(t), c = cos(t);
    return mat2(c, -s, s, c) * v;
  }

  // ACES tonemap (attempt Fitted – Krzysztof Narkowicz)
  vec3 aces(vec3 c) {
    mat3 m1 = mat3(
      0.59719, 0.07600, 0.02840,
      0.35458, 0.90834, 0.13383,
      0.04823, 0.01566, 0.83777
    );
    mat3 m2 = mat3(
       1.60475, -0.10208, -0.00327,
      -0.53108,  1.10813, -0.07276,
      -0.07367, -0.00605,  1.07602
    );
    vec3 v = m1 * c;
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return m2 * (a / b);
  }

  // Xor dot noise (compact hash-free 3D noise)
  float xnoise(vec3 p) {
    const float PHI = 1.618033988;
    const mat3 GOLD = mat3(
      -0.571464913, +0.814921382, +0.096597072,
      -0.278044873, -0.303026659, +0.911518454,
      +0.772087367, +0.494042493, +0.399753815
    );
    return dot(cos(GOLD * p), sin(PHI * p * GOLD));
  }

  void main() {
    float t = time;
    vec2 uv = gl_FragCoord.xy;
    vec3 d = normalize(vec3(2.0 * uv - resolution.xy, resolution.y));
    vec3 p = vec3(0.0, 0.0, t);
    vec3 l = vec3(0.0);

    for (float i = 0.0; i < 10.0; i += 1.0) {
      vec3 b = p;
      b.xy = rot(sin(b.xy), t * 1.5 + b.z * 3.0);
      float s = 0.001 + abs(xnoise(b * 12.0) / 12.0 - xnoise(b)) * 0.4;
      s = max(s, 2.0 - length(p.xy));
      s += abs(p.y * 0.75 + sin(p.z + t * 0.1 + p.x * 1.5)) * 0.2;
      p += d * s;
      l += (1.0 + sin(i + length(p.xy * 0.1) + vec3(3.0, 1.5, 1.0))) / s;
    }

    vec3 col = aces(l * l / 600.0);

    // Sample cover art at a UV derived from ray endpoint for color tinting
    vec2 texUV = fract(p.xy * 0.02 + 0.5);
    vec3 coverCol = mix(
      texture2D(coverTextureA, texUV).rgb,
      texture2D(coverTextureB, texUV).rgb,
      blendFactor
    );

    // Blend volumetric color with cover tint
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, coverCol * luma * 2.0, 0.45);

    // Boost saturation slightly
    float gray = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(gray), col, 1.3);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

/**
 * Cover-art visualizer with three shader variants:
 * - **liquid**: Apple Music-style smooth noise warping, bloom, swirl
 * - **warp**: Kali-fold fractal producing deep nebula-like color fields
 * - **vortex**: Volumetric raymarched vortex tinted by cover art colors
 *
 * Dual-texture crossfade handles track transitions smoothly.
 */
export function AmbientBackground({
  coverUrl,
  variant = "liquid",
  isActive = true,
  className = "",
}: AmbientBackgroundProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef(new THREE.Clock());

  const currentUrlRef = useRef<string | null>(null);
  const showingBRef = useRef(false);
  const blendRef = useRef({ target: 0, current: 0 });
  const materialsRef = useRef<{
    material: THREE.ShaderMaterial | null;
    textureA: THREE.Texture | null;
    textureB: THREE.Texture | null;
  }>({ material: null, textureA: null, textureB: null });

  // ---------- texture helpers ----------

  const loadTexture = useCallback(
    (url: string): Promise<THREE.Texture> =>
      new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");
        loader.load(
          url,
          (tex) => {
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            resolve(tex);
          },
          undefined,
          reject,
        );
      }),
    [],
  );

  // ---------- react to cover URL changes ----------

  useEffect(() => {
    if (!coverUrl || coverUrl === currentUrlRef.current) return;
    currentUrlRef.current = coverUrl;

    loadTexture(coverUrl)
      .then((texture) => {
        const { material } = materialsRef.current;
        if (!material) return;

        if (showingBRef.current) {
          materialsRef.current.textureA?.dispose();
          materialsRef.current.textureA = texture;
          material.uniforms.coverTextureA.value = texture;
          blendRef.current.target = 0;
        } else {
          materialsRef.current.textureB?.dispose();
          materialsRef.current.textureB = texture;
          material.uniforms.coverTextureB.value = texture;
          blendRef.current.target = 1;
        }
        showingBRef.current = !showingBRef.current;
      })
      .catch(() => {});
  }, [coverUrl, loadTexture]);

  // ---------- Three.js setup & animation ----------

  useEffect(() => {
    if (!isActive || !mountRef.current) return;

    const el = mountRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
    });
    const scale = 0.5;
    renderer.setSize(
      Math.floor(el.clientWidth * scale),
      Math.floor(el.clientHeight * scale),
      false,
    );
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    el.appendChild(renderer.domElement);

    const defaultTex = new THREE.DataTexture(
      new Uint8Array([0, 0, 0, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
    defaultTex.needsUpdate = true;

    const chosenFragment =
      variant === "warp"
        ? warpFragmentShader
        : variant === "vortex"
          ? vortexFragmentShader
          : liquidFragmentShader;

    const shaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        resolution: {
          value: new THREE.Vector2(
            Math.floor(el.clientWidth * scale),
            Math.floor(el.clientHeight * scale),
          ),
        },
        time: { value: 0.0 },
        coverTextureA: { value: defaultTex },
        coverTextureB: { value: defaultTex },
        blendFactor: { value: 0.0 },
      },
      vertexShader,
      fragmentShader: chosenFragment,
    });

    materialsRef.current.material = shaderMaterial;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(geometry, shaderMaterial);
    scene.add(quad);

    if (currentUrlRef.current) {
      loadTexture(currentUrlRef.current)
        .then((tex) => {
          materialsRef.current.textureA = tex;
          shaderMaterial.uniforms.coverTextureA.value = tex;
        })
        .catch(() => {});
    }

    const handleResize = () => {
      const w = Math.floor(el.clientWidth * scale);
      const h = Math.floor(el.clientHeight * scale);
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      shaderMaterial.uniforms.resolution.value.set(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(el);

    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      shaderMaterial.uniforms.time.value = clockRef.current.getElapsedTime();

      const blend = blendRef.current;
      const step = 1 / (CROSSFADE_SECONDS * 60);
      if (blend.current < blend.target) {
        blend.current = Math.min(blend.target, blend.current + step);
      } else if (blend.current > blend.target) {
        blend.current = Math.max(blend.target, blend.current - step);
      }
      shaderMaterial.uniforms.blendFactor.value = blend.current;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      if (el && renderer.domElement.parentNode === el) {
        el.removeChild(renderer.domElement);
      }
      scene.remove(quad);
      geometry.dispose();
      shaderMaterial.dispose();
      defaultTex.dispose();
      materialsRef.current.textureA?.dispose();
      materialsRef.current.textureB?.dispose();
      materialsRef.current = { material: null, textureA: null, textureB: null };
      renderer.dispose();
    };
  }, [isActive, variant, loadTexture]);

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
      }}
    />
  );
}
