// WebGL filter runner utility.
// Reuses one compiled program + GL resources per fragment shader so Photo Booth
// preview (~30fps) does not create/lose a WebGL context every frame.

type Uniforms = {
  // Color filters
  brightness?: number; contrast?: number; hue?: number;
  saturate?: number; grayscale?: number; sepia?: number; invert?: number;
  // Distortion effects
  bulge?: number; pinch?: number; twist?: number;
  fisheye?: number; stretch?: number; squeeze?: number;
  tunnel?: number;
  // New effects
  kaleidoscope?: number; ripple?: number; glitch?: number;
  center?: [number, number]; // Center point for distortions (default: [0.5, 0.5])
};

type FilterRunner = {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer;
  texture: WebGLTexture;
  attribLocation: number;
  colorUniformLocations: Map<string, WebGLUniformLocation | null>;
  distortUniformLocations: Map<string, WebGLUniformLocation | null>;
  centerUniformLocation: WebGLUniformLocation | null;
};

const VERTEX_SHADER_SOURCE =
  "attribute vec2 a;varying vec2 v;void main(){v=a*0.5+0.5;gl_Position=vec4(a,0,1);}";

const COLOR_UNIFORM_NAMES = [
  "brightness",
  "contrast",
  "hue",
  "saturate",
  "grayscale",
  "sepia",
  "invert",
] as const;

const DISTORT_UNIFORM_NAMES = [
  "bulge",
  "pinch",
  "twist",
  "fisheye",
  "stretch",
  "squeeze",
  "tunnel",
  "kaleidoscope",
  "ripple",
  "glitch",
] as const;

/** One runner per fragment source; Photo Booth reuses the same shader string. */
const runnersByFragmentSource = new Map<string, FilterRunner>();

// Helper to map CSS filter string to WebGL uniforms object
// This is a simplified parser that only handles the filter functions
// expected in the effects list and maps them to 0-1 or degree values.
export function mapCssFilterStringToUniforms(filterString: string): Record<string, number | number[]> {
  // Default uniform values - these match neutral shader behavior
  const uniforms: Record<string, number | number[]> = {
    brightness: 1.0,
    contrast: 1.0,
    hue: 0.0, // in degrees
    saturate: 1.0,
    grayscale: 0.0,
    sepia: 0.0,
    invert: 0.0,
    bulge: 0.0,
    pinch: 0.0,
    twist: 0.0,
    fisheye: 0.0,
    stretch: 0.0, 
    squeeze: 0.0,
    tunnel: 0.0,
    kaleidoscope: 0.0,
    ripple: 0.0,
    glitch: 0.0,
    center: [0.5, 0.5]
  };

  if (filterString === 'none') {
    return uniforms;
  }

  // Check for special effect keywords that aren't standard CSS filters
  // Format: "effect(strength)" or "effect(strength,centerX,centerY)"
  const specialEffects = {
    'bulge': 'bulge',
    'pinch': 'pinch',
    'dent': 'pinch', // Alias
    'twist': 'twist',
    'twirl': 'twist', // Alias
    'fisheye': 'fisheye',
    'stretch': 'stretch',
    'squeeze': 'squeeze',
    'tunnel': 'tunnel',
    'kaleidoscope': 'kaleidoscope', // New effects
    'ripple': 'ripple',
    'glitch': 'glitch'
  };
  
  // First check for special effect keywords
  for (const [keyword, uniformName] of Object.entries(specialEffects)) {
    const regex = new RegExp(`${keyword}\\(([^)]+)\\)`, 'i');
    const match = filterString.match(regex);
    if (match) {
      const params = match[1].split(',').map(parseFloat);
      if (!isNaN(params[0])) {
        uniforms[uniformName] = params[0];
        
        // If center coordinates are provided
        if (params.length >= 3 && !isNaN(params[1]) && !isNaN(params[2])) {
          uniforms.center = [params[1], params[2]];
        }
      }
    }
  }

  // Then handle standard CSS filters
  const cssFilterRegex = /([a-z-]+)\(([^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = cssFilterRegex.exec(filterString))) {
    const name = match[1].trim();
    let value = parseFloat(match[2].trim());

    // Convert percentage to 0-1, keep degrees as degrees for now
    if (match[2].trim().endsWith('%')) {
      value /= 100;
    }

    switch (name) {
      case 'brightness': uniforms.brightness = value; break;
      case 'contrast': uniforms.contrast = value; break;
      case 'hue-rotate': uniforms.hue = value; break; // degrees
      case 'saturate': uniforms.saturate = value; break;
      case 'grayscale': uniforms.grayscale = value; break;
      case 'sepia': uniforms.sepia = value; break;
      case 'invert': uniforms.invert = value; break;
      default: break; // Special effect keywords handled above
    }
  }
  
  return uniforms;
}

function loseRunnerContext(runner: FilterRunner): void {
  const loseContext = runner.gl.getExtension("WEBGL_lose_context");
  loseContext?.loseContext();
}

function disposeRunner(runner: FilterRunner): void {
  const { gl, program, buffer, texture } = runner;
  try {
    gl.deleteTexture(texture);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
  } catch {
    // Context may already be lost.
  }
  loseRunnerContext(runner);
}

/** Test helper: drop cached GL resources between suites. */
export function resetWebglFilterRunnersForTests(): void {
  for (const runner of runnersByFragmentSource.values()) {
    disposeRunner(runner);
  }
  runnersByFragmentSource.clear();
}

function createRunner(fragmentSource: string): FilterRunner {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl");
  if (!gl) throw new Error("WebGL unavailable");

  const vs = gl.createShader(gl.VERTEX_SHADER);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    if (prog) gl.deleteProgram(prog);
    throw new Error("WebGL shader allocation failed.");
  }

  try {
    gl.shaderSource(vs, VERTEX_SHADER_SOURCE);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error("Vertex shader compilation error:", gl.getShaderInfoLog(vs));
      throw new Error("Vertex shader compilation failed.");
    }

    gl.shaderSource(fs, fragmentSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error(
        "Fragment shader compilation error:",
        gl.getShaderInfoLog(fs)
      );
      throw new Error("Fragment shader compilation failed.");
    }

    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("Shader program linking error:", gl.getProgramInfoLog(prog));
      throw new Error("Shader program linking failed.");
    }
  } catch (error) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.deleteProgram(prog);
    const loseContext = gl.getExtension("WEBGL_lose_context");
    loseContext?.loseContext();
    throw error;
  }

  // Shaders are no longer needed once the program has linked.
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  gl.useProgram(prog);

  const buf = gl.createBuffer();
  if (!buf) {
    gl.deleteProgram(prog);
    throw new Error("WebGL buffer allocation failed.");
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, +1, -1, -1, +1, +1, +1]),
    gl.STATIC_DRAW
  );
  const attribLocation = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(attribLocation);
  gl.vertexAttribPointer(attribLocation, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  if (!tex) {
    gl.deleteBuffer(buf);
    gl.deleteProgram(prog);
    throw new Error("WebGL texture allocation failed.");
  }
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const colorUniformLocations = new Map<string, WebGLUniformLocation | null>();
  for (const name of COLOR_UNIFORM_NAMES) {
    colorUniformLocations.set(name, gl.getUniformLocation(prog, `u_${name}`));
  }
  const distortUniformLocations = new Map<
    string,
    WebGLUniformLocation | null
  >();
  for (const name of DISTORT_UNIFORM_NAMES) {
    distortUniformLocations.set(name, gl.getUniformLocation(prog, `u_${name}`));
  }

  return {
    canvas,
    gl,
    program: prog,
    buffer: buf,
    texture: tex,
    attribLocation,
    colorUniformLocations,
    distortUniformLocations,
    centerUniformLocation: gl.getUniformLocation(prog, "u_center"),
  };
}

function getRunner(fragmentSource: string): FilterRunner {
  const existing = runnersByFragmentSource.get(fragmentSource);
  if (existing) {
    // Context can be lost when the browser hits its live-context cap.
    if (!existing.gl.isContextLost()) {
      return existing;
    }
    runnersByFragmentSource.delete(fragmentSource);
    disposeRunner(existing);
  }

  const runner = createRunner(fragmentSource);
  runnersByFragmentSource.set(fragmentSource, runner);
  return runner;
}

export async function runFilter(
  source: HTMLCanvasElement | HTMLVideoElement,
  uniforms: Uniforms,
  fragmentSource: string
): Promise<HTMLCanvasElement> {
  // Prefer duck-typing over `instanceof HTMLVideoElement` so unit tests (and
  // non-DOM hosts) can supply a canvas-like source without a full DOM.
  const isVideo =
    typeof HTMLVideoElement !== "undefined" &&
    source instanceof HTMLVideoElement;
  const w = isVideo ? source.videoWidth : (source as HTMLCanvasElement).width;
  const h = isVideo ? source.videoHeight : (source as HTMLCanvasElement).height;

  const runner = getRunner(fragmentSource);
  const { canvas: glCanvas, gl, program } = runner;

  if (glCanvas.width !== w || glCanvas.height !== h) {
    glCanvas.width = w;
    glCanvas.height = h;
  }

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, runner.buffer);
  gl.enableVertexAttribArray(runner.attribLocation);
  gl.vertexAttribPointer(runner.attribLocation, 2, gl.FLOAT, false, 0, 0);

  // ––– upload texture –––
  gl.bindTexture(gl.TEXTURE_2D, runner.texture);
  // Use `unpackFlipYWEBGL` to correctly orient video texture
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); // Reset state

  // ––– push uniforms –––
  // Color filter uniforms
  const colorUniforms: Record<string, number> = {
    brightness: uniforms.brightness ?? 1.0,
    contrast: uniforms.contrast ?? 1.0,
    hue: uniforms.hue ?? 0.0, // degrees, converted in shader
    saturate: uniforms.saturate ?? 1.0,
    grayscale: uniforms.grayscale ? 1.0 : 0.0, // 0 or 1
    sepia: uniforms.sepia ? 1.0 : 0.0, // 0 or 1
    invert: uniforms.invert ? 1.0 : 0.0, // 0 or 1
  };

  // Distortion effect uniforms
  const distortUniforms: Record<string, number> = {
    bulge: uniforms.bulge ?? 0.0,
    pinch: uniforms.pinch ?? 0.0,
    twist: uniforms.twist ?? 0.0,
    fisheye: uniforms.fisheye ?? 0.0,
    stretch: uniforms.stretch ?? 0.0,
    squeeze: uniforms.squeeze ?? 0.0,
    tunnel: uniforms.tunnel ?? 0.0,
    kaleidoscope: uniforms.kaleidoscope ?? 0.0, // New effects
    ripple: uniforms.ripple ?? 0.0,
    glitch: uniforms.glitch ?? 0.0
  };

  for (const [k, v] of Object.entries(colorUniforms)) {
    const u = runner.colorUniformLocations.get(k);
    if (u) gl.uniform1f(u, v);
  }

  for (const [k, v] of Object.entries(distortUniforms)) {
    const u = runner.distortUniformLocations.get(k);
    if (u) gl.uniform1f(u, v);
  }

  if (runner.centerUniformLocation) {
    const center = uniforms.center ?? [0.5, 0.5];
    gl.uniform2f(runner.centerUniformLocation, center[0], center[1]);
  }

  // ––– draw –––
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.viewport(0, 0, w, h);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // Return the canvas containing the rendered GL output
  return glCanvas;
}
