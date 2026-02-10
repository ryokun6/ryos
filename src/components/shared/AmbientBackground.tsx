import { useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { getAudioContext, resumeAudioContext } from "@/lib/audioContext";

/** Duration of crossfade between cover textures (seconds) */
const CROSSFADE_SECONDS = 1.5;

interface AmbientBackgroundProps {
  /** URL of the cover art to use as color source */
  coverUrl: string | null;
  /** Whether the background should be active/animating */
  isActive?: boolean;
  className?: string;
}

// --- Vertex shader (shared fullscreen quad) ---
const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// --- Fragment shader: Kali warp + beat-reactive ---
const fragmentShader = `
  uniform vec2 resolution;
  uniform float time;
  uniform sampler2D coverTextureA;
  uniform sampler2D coverTextureB;
  uniform float blendFactor;
  uniform float beat;      // accumulated beat energy (ever-increasing, drives speed)
  uniform float beatNow;   // instantaneous 0–1 beat (drives brightness/saturation)
  varying vec2 vUv;

  void main() {
    float s = 0.0, v = 0.0;
    vec2 uv = (gl_FragCoord.xy / resolution.xy) * 2.0 - 1.0;

    // beatAccum is a continuously increasing value driven by mic energy
    float t = (time - 2.0) * 30.0 + beat * 120.0;

    // Orbit stays stable (no shake)
    vec3 init = vec3(
      sin(t * 0.0032) * 0.3,
      0.35 - cos(t * 0.005) * 0.3,
      t * 0.002
    );

    // Folds stay constant (no shake)
    float foldK = 2.04;
    float foldOffset = 0.9;

    vec3 col = vec3(0.0);
    for (int r = 0; r < 40; r++) {
      vec3 p = init + s * vec3(uv, 0.05);
      p.z = fract(p.z);

      for (int i = 0; i < 6; i++) {
        p = abs(p * foldK) / dot(p, p) - foldOffset;
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

    // Saturation boost (extra on beat)
    float gray = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(gray), col, 1.4 + beatNow * 0.4);

    // Brightness: base dim + beat flash
    col *= 0.7 + beatNow * 0.35;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

// ---------- Mic beat analyser helpers ----------

interface MicAnalyser {
  analyser: AnalyserNode;
  data: Uint8Array;
  stream: MediaStream;
}

async function createMicAnalyser(): Promise<MicAnalyser | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    await resumeAudioContext();
    const ctx = getAudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256; // 128 frequency bins – lightweight
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);
    // Don't connect analyser to destination (no feedback)
    const data = new Uint8Array(analyser.frequencyBinCount);
    return { analyser, data, stream };
  } catch {
    // User denied mic or not available – shader still runs, just no reactivity
    return null;
  }
}

/** Return 0–1 beat intensity from the low-frequency (bass) bins */
function getBeatLevel(mic: MicAnalyser): number {
  mic.analyser.getByteFrequencyData(mic.data);
  // Average the lowest 8 bins (~0-700 Hz with 256 fftSize at 44.1 kHz)
  let sum = 0;
  const bins = Math.min(8, mic.data.length);
  for (let i = 0; i < bins; i++) {
    sum += mic.data[i];
  }
  return sum / (bins * 255);
}

// -----------------------------------------------

/**
 * Ambient background that runs the cover art through a Kali-fold warp shader,
 * producing a deep, flowing nebula-like color field derived from the album
 * artwork. Reacts to microphone bass beats for pulsing visuals.
 * Dual-texture crossfade handles track transitions smoothly.
 */
export function AmbientBackground({
  coverUrl,
  isActive = true,
  className = "",
}: AmbientBackgroundProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef(new THREE.Clock());

  // Refs for cross-effect communication
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
      .catch(() => {
        /* texture failed to load – keep current */
      });
  }, [coverUrl, loadTexture]);

  // ---------- Three.js setup & animation ----------

  useEffect(() => {
    if (!isActive || !mountRef.current) return;

    const el = mountRef.current;

    // Scene
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 0.5));
    el.appendChild(renderer.domElement);

    // 1×1 black default texture
    const defaultTex = new THREE.DataTexture(
      new Uint8Array([0, 0, 0, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
    defaultTex.needsUpdate = true;

    const shaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        resolution: {
          value: new THREE.Vector2(el.clientWidth, el.clientHeight),
        },
        time: { value: 0.0 },
        coverTextureA: { value: defaultTex },
        coverTextureB: { value: defaultTex },
        blendFactor: { value: 0.0 },
        beat: { value: 0.0 },
        beatNow: { value: 0.0 },
      },
      vertexShader,
      fragmentShader,
    });

    materialsRef.current.material = shaderMaterial;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(geometry, shaderMaterial);
    scene.add(quad);

    // Load initial cover texture into slot A
    if (currentUrlRef.current) {
      loadTexture(currentUrlRef.current)
        .then((tex) => {
          materialsRef.current.textureA = tex;
          shaderMaterial.uniforms.coverTextureA.value = tex;
        })
        .catch(() => {});
    }

    // Mic analyser (async – shader works fine without it)
    let mic: MicAnalyser | null = null;
    let smoothedBeat = 0;
    let beatAccum = 0;      // ever-increasing accumulated beat energy
    let instantBeat = 0;    // current frame beat for brightness
    createMicAnalyser().then((m) => {
      mic = m;
    });

    // Resize handler – use ResizeObserver to catch both browser and
    // in-app window resizes (e.g. ryOS WindowFrame dragging)
    const handleResize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      shaderMaterial.uniforms.resolution.value.set(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(el);

    // Animation loop
    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);

      // Time
      shaderMaterial.uniforms.time.value = clockRef.current.getElapsedTime();

      // Beat from mic
      if (mic) {
        const raw = getBeatLevel(mic);
        // Smooth: fast attack, slower decay
        smoothedBeat = raw > smoothedBeat
          ? raw * 0.6 + smoothedBeat * 0.4   // attack
          : raw * 0.15 + smoothedBeat * 0.85; // decay
        instantBeat = smoothedBeat;
        // Accumulate beat energy so speed is continuous, not snapping
        beatAccum += smoothedBeat * 0.016; // ~1/60s per frame
        shaderMaterial.uniforms.beat.value = beatAccum;
        shaderMaterial.uniforms.beatNow.value = instantBeat;
      }

      // Smooth blend
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

    // Cleanup
    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();

      // Stop mic
      if (mic) {
        mic.stream.getTracks().forEach((t) => { t.stop(); });
        mic = null;
      }

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
  }, [isActive, loadTexture]);

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
