import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";

export interface DashboardRippleRef {
  triggerRipple: (x: number, y: number) => void;
}

interface RippleState {
  x: number;
  y: number;
  startTime: number;
}

const MAX_RIPPLES = 5;
const RIPPLE_DURATION = 2.5;

/* ------------------------------------------------------------------ */
/*  GLSL shaders                                                       */
/* ------------------------------------------------------------------ */

const VERT = `
attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform sampler2D u_tex;
uniform vec2  u_res;          // canvas pixels
uniform vec2  u_imgSize;      // wallpaper natural size
uniform float u_tint;         // overlay darkness (0.55)
uniform int   u_count;
uniform vec2  u_centers[${MAX_RIPPLES}];
uniform float u_times[${MAX_RIPPLES}];
uniform float u_hasTex;       // 1.0 when texture is loaded

const float PI2 = 6.28318530718;

/* background-size:cover UV mapping */
vec2 coverUV(vec2 uv){
  float sa = u_res.x / u_res.y;
  float ia = u_imgSize.x / u_imgSize.y;
  vec2 s = sa > ia
    ? vec2(1.0, (sa / ia))
    : vec2((ia / sa), 1.0);
  return (uv - 0.5) / s + 0.5;
}

void main(){
  vec2 fc = gl_FragCoord.xy;
  fc.y = u_res.y - fc.y;

  vec2 totalDisp = vec2(0.0);
  float totalH = 0.0;
  vec2 totalGrad = vec2(0.0);

  for(int i = 0; i < ${MAX_RIPPLES}; i++){
    if(i >= u_count) break;
    float t = u_times[i];
    vec2 delta = fc - u_centers[i];
    float d = length(delta);
    vec2 dir = delta / max(d, 1.0);

    float speed   = 340.0;
    float wl      = 200.0;
    float damping = 2.2;
    float spread  = 1.2;
    float amp     = 30.0;

    float k     = PI2 / wl;
    float front = t * speed;
    float sigma = wl * spread;

    float env   = exp(-0.5 * pow((d - front) / sigma, 2.0));
    float decay = exp(-damping * t);
    float wave  = sin(k * (d - front));
    float dWave = cos(k * (d - front)) * k;

    float h = wave * env * decay;
    totalH += h;

    /* displacement along radial direction */
    totalDisp += dir * h * amp;

    /* analytical gradient for lighting */
    totalGrad += dir * dWave * env * decay * amp;

    /* initial splash */
    float splash = exp(-d * d / (2.0 * 5000.0)) * max(0.0, 1.0 - t / 0.18);
    totalDisp += dir * splash * 60.0;
    totalH += splash * 2.0;
  }

  vec2 uv = fc / u_res;
  vec2 dUV = totalDisp / u_res;

  vec3 col;
  if(u_hasTex > 0.5){
    vec2 cUV = coverUV(uv + dUV);
    col = texture2D(u_tex, clamp(cUV, 0.0, 1.0)).rgb;
  } else {
    vec2 fUV = uv + dUV;
    col = vec3(0.12 + fUV.x * 0.15, 0.15 + fUV.y * 0.12, 0.25);
  }

  col *= (1.0 - u_tint);

  /* specular highlight from wave surface normal */
  vec3 N = normalize(vec3(-totalGrad * 0.5, 1.0));
  vec3 L = normalize(vec3(0.3, -0.4, 0.9));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 8.0);
  col += spec * 0.35;

  /* brightness modulation from wave height */
  col += totalH * 0.10;

  /* subtle Fresnel edge brightening on wave slopes */
  float fresnel = 1.0 - abs(dot(N, V));
  col += fresnel * fresnel * 0.12;

  gl_FragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/*  WebGL helpers                                                      */
/* ------------------------------------------------------------------ */

function makeShader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn("[DashboardRipple]", gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function makeProgram(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader) {
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn("[DashboardRipple]", gl.getProgramInfoLog(p));
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

interface GLState {
  gl: WebGLRenderingContext;
  prog: WebGLProgram;
  uRes: WebGLUniformLocation | null;
  uImgSize: WebGLUniformLocation | null;
  uTint: WebGLUniformLocation | null;
  uCount: WebGLUniformLocation | null;
  uHasTex: WebGLUniformLocation | null;
  uCenters: (WebGLUniformLocation | null)[];
  uTimes: (WebGLUniformLocation | null)[];
  tex: WebGLTexture | null;
  texW: number;
  texH: number;
}

/* ------------------------------------------------------------------ */
/*  React component                                                    */
/* ------------------------------------------------------------------ */

interface DashboardRippleProps {
  wallpaperUrl?: string;
  tintOpacity?: number;
}

const DashboardRippleInner = (
  { wallpaperUrl, tintOpacity = 0.55 }: DashboardRippleProps,
  ref: React.Ref<DashboardRippleRef>
) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glStateRef = useRef<GLState | null>(null);
  const ripplesRef = useRef<RippleState[]>([]);
  const rafRef = useRef(0);
  const needsStaticRef = useRef(true);

  /* ---------- init WebGL ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;

    const gl = (
      canvas.getContext("webgl2", { alpha: false, antialias: false }) ??
      canvas.getContext("webgl", { alpha: false, antialias: false })
    ) as WebGLRenderingContext | null;
    if (!gl) return;

    const vs = makeShader(gl, gl.VERTEX_SHADER, VERT);
    const fs = makeShader(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = makeProgram(gl, vs, fs);
    if (!prog) return;

    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const state: GLState = {
      gl, prog,
      uRes: gl.getUniformLocation(prog, "u_res"),
      uImgSize: gl.getUniformLocation(prog, "u_imgSize"),
      uTint: gl.getUniformLocation(prog, "u_tint"),
      uCount: gl.getUniformLocation(prog, "u_count"),
      uHasTex: gl.getUniformLocation(prog, "u_hasTex"),
      uCenters: Array.from({ length: MAX_RIPPLES }, (_, i) =>
        gl.getUniformLocation(prog, `u_centers[${i}]`)
      ),
      uTimes: Array.from({ length: MAX_RIPPLES }, (_, i) =>
        gl.getUniformLocation(prog, `u_times[${i}]`)
      ),
      tex: null, texW: 1, texH: 1,
    };
    glStateRef.current = state;
    needsStaticRef.current = true;

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
      if (state.tex) gl.deleteTexture(state.tex);
    };
  }, []);

  /* ---------- resize ---------- */
  useEffect(() => {
    const onResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      needsStaticRef.current = true;
      if (!rafRef.current) rafRef.current = requestAnimationFrame(render);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- load wallpaper texture ---------- */
  useEffect(() => {
    const s = glStateRef.current;
    if (!s || !wallpaperUrl) return;
    const { gl } = s;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (s.tex) gl.deleteTexture(s.tex);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      s.tex = tex;
      s.texW = img.naturalWidth;
      s.texH = img.naturalHeight;
      needsStaticRef.current = true;
      if (!rafRef.current) rafRef.current = requestAnimationFrame(render);
    };
    img.src = wallpaperUrl;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallpaperUrl]);

  /* ---------- render loop ---------- */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const render = () => {
    const s = glStateRef.current;
    if (!s) return;
    const { gl, prog } = s;

    const now = performance.now() / 1000;
    ripplesRef.current = ripplesRef.current.filter(
      (r) => now - r.startTime < RIPPLE_DURATION
    );
    const active = ripplesRef.current.length > 0;

    if (!active && !needsStaticRef.current) {
      rafRef.current = 0;
      return;
    }
    needsStaticRef.current = false;

    const dpr = window.devicePixelRatio || 1;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(prog);

    gl.uniform2f(s.uRes, gl.canvas.width, gl.canvas.height);
    gl.uniform2f(s.uImgSize, s.texW, s.texH);
    gl.uniform1f(s.uTint, tintOpacity);
    gl.uniform1f(s.uHasTex, s.tex ? 1.0 : 0.0);
    gl.uniform1i(s.uCount, ripplesRef.current.length);

    if (s.tex) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, s.tex);
      gl.uniform1i(gl.getUniformLocation(prog, "u_tex"), 0);
    }

    for (let i = 0; i < MAX_RIPPLES; i++) {
      if (i < ripplesRef.current.length) {
        const r = ripplesRef.current[i];
        gl.uniform2f(s.uCenters[i], r.x * dpr, r.y * dpr);
        gl.uniform1f(s.uTimes[i], now - r.startTime);
      } else {
        gl.uniform2f(s.uCenters[i], 0, 0);
        gl.uniform1f(s.uTimes[i], 0);
      }
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if (active) {
      rafRef.current = requestAnimationFrame(render);
    } else {
      needsStaticRef.current = true;
      rafRef.current = requestAnimationFrame(render);
    }
  };

  /* ---------- kick a static frame after GL init ---------- */
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (glStateRef.current && needsStaticRef.current) render();
    });
    return () => cancelAnimationFrame(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- imperative API ---------- */
  useImperativeHandle(
    ref,
    () => ({
      triggerRipple(x: number, y: number) {
        const now = performance.now() / 1000;
        ripplesRef.current = [
          ...ripplesRef.current.slice(-(MAX_RIPPLES - 1)),
          { x, y, startTime: now },
        ];
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(render);
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
};

export const DashboardRipple = forwardRef(DashboardRippleInner);
