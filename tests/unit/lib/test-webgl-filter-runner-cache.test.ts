import { afterEach, describe, expect, test } from "bun:test";
import {
  mapCssFilterStringToUniforms,
  resetWebglFilterRunnersForTests,
  runFilter,
} from "../../../src/lib/webglFilterRunner";

/**
 * R5: runFilter must reuse one WebGL context/program per fragment source
 * instead of allocating a new one every call.
 */

function createFakeGl() {
  return {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    TEXTURE_2D: 0x0de1,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812f,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    COLOR_BUFFER_BIT: 0x4000,
    TRIANGLE_STRIP: 0x0005,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    createShader: () => ({ kind: "shader" }),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => "",
    createProgram: () => ({ kind: "program" }),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    useProgram: () => {},
    deleteShader: () => {},
    deleteProgram: () => {},
    createBuffer: () => ({ kind: "buffer" }),
    bindBuffer: () => {},
    bufferData: () => {},
    getAttribLocation: () => 0,
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    createTexture: () => ({ kind: "texture" }),
    bindTexture: () => {},
    texParameteri: () => {},
    pixelStorei: () => {},
    texImage2D: () => {},
    getUniformLocation: (_prog: unknown, name: string) => ({ name }),
    uniform1f: () => {},
    uniform2f: () => {},
    clearColor: () => {},
    clear: () => {},
    viewport: () => {},
    drawArrays: () => {},
    isContextLost: () => false,
    getExtension: () => null,
    deleteBuffer: () => {},
    deleteTexture: () => {},
  };
}

function installCreateElementStub(gl: ReturnType<typeof createFakeGl>) {
  let runnerCanvasCreates = 0;
  let getContextCalls = 0;

  const previousDocument = (globalThis as { document?: Document }).document;
  const previousCreateElement = previousDocument?.createElement?.bind(
    previousDocument
  );

  const stubCreateElement = ((tagName: string) => {
    if (String(tagName).toLowerCase() !== "canvas") {
      if (previousCreateElement) {
        return previousCreateElement(tagName as "canvas");
      }
      throw new Error(`Unexpected createElement(${tagName})`);
    }
    runnerCanvasCreates += 1;
    return {
      width: 0,
      height: 0,
      getContext: (type: string) => {
        if (type === "webgl") {
          getContextCalls += 1;
          return gl;
        }
        return null;
      },
    } as unknown as HTMLCanvasElement;
  }) as Document["createElement"];

  if (previousDocument) {
    Object.defineProperty(previousDocument, "createElement", {
      configurable: true,
      writable: true,
      value: stubCreateElement,
    });
  } else {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: { createElement: stubCreateElement },
    });
  }

  return {
    runnerCanvasCreates: () => runnerCanvasCreates,
    getContextCalls: () => getContextCalls,
    createSourceCanvas: () =>
      ({
        width: 32,
        height: 24,
      }) as unknown as HTMLCanvasElement,
    restore: () => {
      if (previousDocument && previousCreateElement) {
        Object.defineProperty(previousDocument, "createElement", {
          configurable: true,
          writable: true,
          value: previousCreateElement,
        });
      } else if (!previousDocument) {
        delete (globalThis as { document?: unknown }).document;
      }
    },
  };
}

afterEach(() => {
  resetWebglFilterRunnersForTests();
});

describe("mapCssFilterStringToUniforms", () => {
  test("parses brightness and special distortion keywords", () => {
    const uniforms = mapCssFilterStringToUniforms(
      "brightness(120%) bulge(0.4,0.3,0.7)"
    );
    expect(uniforms.brightness).toBeCloseTo(1.2);
    expect(uniforms.bulge).toBeCloseTo(0.4);
    expect(uniforms.center).toEqual([0.3, 0.7]);
  });
});

describe("runFilter WebGL reuse", () => {
  test("creates one WebGL context for repeated calls with the same fragment source", async () => {
    const gl = createFakeGl();
    const stub = installCreateElementStub(gl);

    try {
      const source = stub.createSourceCanvas();
      const frag =
        "precision mediump float; void main(){ gl_FragColor=vec4(1.0); }";
      const first = await runFilter(source, { brightness: 1.1 }, frag);
      const second = await runFilter(source, { brightness: 0.9 }, frag);
      const third = await runFilter(source, { bulge: 0.2 }, frag);

      expect(stub.runnerCanvasCreates()).toBe(1);
      expect(stub.getContextCalls()).toBe(1);
      expect(first).toBe(second);
      expect(second).toBe(third);
      expect(first.width).toBe(32);
      expect(first.height).toBe(24);
    } finally {
      stub.restore();
    }
  });
});
