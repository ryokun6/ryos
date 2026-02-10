import { useRef, useEffect, useCallback } from "react";
import * as THREE from "three";

/** Duration of crossfade between cover textures (seconds) */
const CROSSFADE_SECONDS = 1.5;

/** Render at this fraction of the container size (scaled up via CSS) */
const RENDER_SCALE = 0.5;

/** Target frame rate for the shader */
const TARGET_FPS = 60;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

/** Smoothing factor for audio values (0 = no smoothing, 1 = frozen) */
const AUDIO_SMOOTH = 0.7;

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

// --- Fragment shader: Kali warp distortion sampling from cover art ---
// audioLevel / bassBeat uniforms modulate speed, orbit, brightness & saturation
const fragmentShader = `
  uniform vec2 resolution;
  uniform float time;
  uniform sampler2D coverTextureA;
  uniform sampler2D coverTextureB;
  uniform float blendFactor;
  uniform float coverAspectA;
  uniform float coverAspectB;
  uniform float audioLevel;
  uniform float bassBeat;
  varying vec2 vUv;

  // Sample cover with aspect-ratio-correct "cover" fit
  vec3 sampleCover(sampler2D tex, vec2 uv, float aspect) {
    vec2 st = uv;
    if (aspect > 1.0) {
      st.x = st.x / aspect + (1.0 - 1.0 / aspect) * 0.5;
    } else {
      st.y = st.y * aspect + (1.0 - aspect) * 0.5;
    }
    return texture2D(tex, st).rgb;
  }

  void main() {
    float s = 0.0, v = 0.0;
    vec2 uv = (gl_FragCoord.xy / resolution.xy) * 2.0 - 1.0;

    // Steady base time
    float t = (time - 2.0) * 78.0;

    vec3 init = vec3(
      sin(t * 0.0032) * 0.4,
      0.35 - cos(t * 0.005) * 0.4,
      t * 0.003
    );

    // Audio-reactive Kali fold strength: bass warps harder
    float foldScale = 2.04 + bassBeat * 0.4;
    float foldOffset = -0.9 - bassBeat * 0.15;

    // Audio-reactive UV scale: louder = more zoomed/warped pattern
    float uvScale = 0.15 + audioLevel * 0.1;

    // Accumulate warped texture samples along a ray
    vec3 col = vec3(0.0);
    for (int r = 0; r < 50; r++) {
      vec3 p = init + s * vec3(uv, 0.05);
      p.z = fract(p.z);

      // Kali chaotic fold — bass-reactive strength
      for (int i = 0; i < 4; i++) {
        p = abs(p * foldScale) / dot(p, p) + foldOffset;
      }

      v += pow(dot(p, p), 0.7) * 0.06;

      // Sample cover texture at warped coordinates (aspect-correct)
      vec2 texUV = fract(p.xy * uvScale + 0.5);
      vec3 texCol = mix(
        sampleCover(coverTextureA, texUV, coverAspectA),
        sampleCover(coverTextureB, texUV, coverAspectB),
        blendFactor
      );

      // Audio-reactive accumulation: lower baseline, audio brings it up
      float weight = 0.004 + audioLevel * 0.008;
      col += texCol * v * weight;
      s += 0.05;
    }

    // Audio-reactive saturation: bass boosts color
    float sat = 1.8 + bassBeat * 1.5;
    float gray = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(gray), col, sat);

    // Contrast / glow curve — bass pushes gamma brighter
    float gamma = 0.75 - bassBeat * 0.15;
    col = pow(col, vec3(gamma));

    // Soft bloom via tanh — audio boosts bloom
    float bloom = 1.2 + audioLevel * 0.6;
    gl_FragColor = vec4(tanh(col * bloom), 1.0);
  }
`;

/**
 * Ambient background that runs the cover art through a Kali-fold warp shader,
 * producing a deep, flowing nebula-like color field derived from the album
 * artwork.  Reacts to microphone audio input when available.
 *
 * Renders at a small internal resolution (RENDER_SCALE) and the canvas is
 * scaled up via CSS, which adds natural bilinear blur for free.
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
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const materialsRef = useRef<{
    material: THREE.ShaderMaterial | null;
    textureA: THREE.Texture | null;
    textureB: THREE.Texture | null;
  }>({ material: null, textureA: null, textureB: null });

  // Audio analysis refs
  const audioRef = useRef<{
    ctx: AudioContext | null;
    analyser: AnalyserNode | null;
    stream: MediaStream | null;
    freqData: Uint8Array;
    smoothLevel: number;
    smoothBass: number;
  }>({
    ctx: null,
    analyser: null,
    stream: null,
    freqData: new Uint8Array(256),
    smoothLevel: 0,
    smoothBass: 0,
  });

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

        const aspect = texture.image
          ? (texture.image as HTMLImageElement).naturalWidth /
            (texture.image as HTMLImageElement).naturalHeight
          : 1;

        if (showingBRef.current) {
          materialsRef.current.textureA?.dispose();
          materialsRef.current.textureA = texture;
          material.uniforms.coverTextureA.value = texture;
          material.uniforms.coverAspectA.value = aspect;
          blendRef.current.target = 0;
        } else {
          materialsRef.current.textureB?.dispose();
          materialsRef.current.textureB = texture;
          material.uniforms.coverTextureB.value = texture;
          material.uniforms.coverAspectB.value = aspect;
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

    // Scene
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(1);
    const initW = Math.max(1, Math.floor(el.clientWidth * RENDER_SCALE));
    const initH = Math.max(1, Math.floor(el.clientHeight * RENDER_SCALE));
    renderer.setSize(initW, initH, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    el.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Default texture
    const defaultTex = new THREE.DataTexture(
      new Uint8Array([0, 0, 0, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );
    defaultTex.needsUpdate = true;

    const shaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        resolution: { value: new THREE.Vector2(initW, initH) },
        time: { value: 0.0 },
        coverTextureA: { value: defaultTex },
        coverTextureB: { value: defaultTex },
        blendFactor: { value: 0.0 },
        coverAspectA: { value: 1.0 },
        coverAspectB: { value: 1.0 },
        audioLevel: { value: 0.0 },
        bassBeat: { value: 0.0 },
      },
      vertexShader,
      fragmentShader,
    });

    materialsRef.current.material = shaderMaterial;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(geometry, shaderMaterial);
    scene.add(quad);

    // Load initial cover texture
    if (currentUrlRef.current) {
      loadTexture(currentUrlRef.current)
        .then((tex) => {
          materialsRef.current.textureA = tex;
          shaderMaterial.uniforms.coverTextureA.value = tex;
          const aspect = tex.image
            ? (tex.image as HTMLImageElement).naturalWidth /
              (tex.image as HTMLImageElement).naturalHeight
            : 1;
          shaderMaterial.uniforms.coverAspectA.value = aspect;
        })
        .catch(() => {});
    }

    // --- Mic audio setup (progressive: works without if denied) ---
    const audio = audioRef.current;
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .then((stream) => {
        audio.stream = stream;
        audio.ctx = new AudioContext();
        audio.analyser = audio.ctx.createAnalyser();
        audio.analyser.fftSize = 512;
        audio.analyser.smoothingTimeConstant = 0.6;
        audio.freqData = new Uint8Array(audio.analyser.frequencyBinCount);
        const source = audio.ctx.createMediaStreamSource(stream);
        source.connect(audio.analyser);
      })
      .catch(() => {
        /* mic denied – shader still works, just no reactivity */
      });

    // ResizeObserver
    const ro = new ResizeObserver(() => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (width < 1 || height < 1) return;
      const w = Math.max(1, Math.floor(width * RENDER_SCALE));
      const h = Math.max(1, Math.floor(height * RENDER_SCALE));
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      shaderMaterial.uniforms.resolution.value.set(w, h);
    });
    ro.observe(el);

    // Animation loop
    let frameId: number;
    let lastFrameTime = 0;
    const animate = (now: number) => {
      frameId = requestAnimationFrame(animate);
      if (now - lastFrameTime < FRAME_INTERVAL) return;
      lastFrameTime = now;

      // Time
      shaderMaterial.uniforms.time.value = clockRef.current.getElapsedTime();

      // Audio analysis
      if (audio.analyser) {
        audio.analyser.getByteFrequencyData(audio.freqData);
        const data = audio.freqData;

        // Bass: first 8 bins (~0-340 Hz at 44100/512)
        let bass = 0;
        for (let i = 0; i < 8; i++) bass += data[i];
        bass /= 8 * 255;

        // Overall: all bins
        let level = 0;
        for (let i = 0; i < data.length; i++) level += data[i];
        level /= data.length * 255;

        // Smooth
        audio.smoothBass = audio.smoothBass * AUDIO_SMOOTH + bass * (1 - AUDIO_SMOOTH);
        audio.smoothLevel = audio.smoothLevel * AUDIO_SMOOTH + level * (1 - AUDIO_SMOOTH);

        shaderMaterial.uniforms.bassBeat.value = audio.smoothBass;
        shaderMaterial.uniforms.audioLevel.value = audio.smoothLevel;
      }

      // Smooth blend
      const blend = blendRef.current;
      const step = 1 / (CROSSFADE_SECONDS * TARGET_FPS);
      if (blend.current < blend.target) {
        blend.current = Math.min(blend.target, blend.current + step);
      } else if (blend.current > blend.target) {
        blend.current = Math.max(blend.target, blend.current - step);
      }
      shaderMaterial.uniforms.blendFactor.value = blend.current;

      renderer.render(scene, camera);
    };
    frameId = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      cancelAnimationFrame(frameId);
      ro.disconnect();

      // Stop mic
      if (audio.stream) {
        for (const t of audio.stream.getTracks()) t.stop();
        audio.stream = null;
      }
      if (audio.ctx) {
        audio.ctx.close().catch(() => {});
        audio.ctx = null;
        audio.analyser = null;
      }
      audio.smoothLevel = 0;
      audio.smoothBass = 0;

      if (el && renderer.domElement.parentNode === el) {
        el.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
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
        overflow: "hidden",
      }}
    />
  );
}
