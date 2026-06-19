import { describe, test, expect, afterEach } from "bun:test";

/**
 * Unit tests for the unified 3-tier shader-performance classifier.
 *
 * Verifies the merged heuristic that replaced the two previously independent
 * systems (boot-time on/off probe + per-component reduced-graphics check):
 *
 *   off     → extremely low-end / low-power devices (shaders default off)
 *   reduced → phones, tablets, low-/mid-perf PCs (lower-quality shaders)
 *   full    → performance desktops/laptops (full-quality shaders)
 */

import {
  getPerformanceTier,
  isMobileDevice,
  __resetPerformanceTierCacheForTests,
} from "../src/utils/performanceTier";

// Unique sentinels for the two GL enum constants the probe reads via
// getParameter, so the fake context can tell them apart.
const MAX_TEXTURE_SIZE = "MAX_TEXTURE_SIZE" as unknown as number;
const MAX_TEXTURE_MAX_ANISOTROPY_EXT =
  "MAX_TEXTURE_MAX_ANISOTROPY_EXT" as unknown as number;

interface FakeEnv {
  cores?: number;
  memory?: number | undefined;
  maxTouchPoints?: number;
  hasOnTouchStart?: boolean;
  coarsePointer?: boolean;
  // GPU caps; omit `webgl` to simulate no WebGL support at all.
  webgl?: boolean;
  anisotropy?: number;
  textureSize?: number;
  highp?: boolean;
}

const savedGlobals: Record<string, PropertyDescriptor | undefined> = {};

function defineGlobal(name: string, value: unknown) {
  if (!(name in savedGlobals)) {
    savedGlobals[name] = Object.getOwnPropertyDescriptor(globalThis, name);
  }
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

function makeGl(env: FakeEnv) {
  return {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    HIGH_FLOAT: 3,
    MAX_TEXTURE_SIZE,
    getExtension(name: string) {
      if (name.includes("anisotropic")) {
        return { MAX_TEXTURE_MAX_ANISOTROPY_EXT };
      }
      if (name === "WEBGL_lose_context") {
        return { loseContext() {} };
      }
      return null;
    },
    getParameter(param: number) {
      if (param === MAX_TEXTURE_SIZE) return env.textureSize ?? 16384;
      if (param === MAX_TEXTURE_MAX_ANISOTROPY_EXT) return env.anisotropy ?? 16;
      return 0;
    },
    getShaderPrecisionFormat() {
      return { precision: (env.highp ?? true) ? 23 : 0 };
    },
  };
}

function applyEnv(env: FakeEnv) {
  __resetPerformanceTierCacheForTests();

  defineGlobal("navigator", {
    hardwareConcurrency: env.cores ?? 8,
    deviceMemory: env.memory,
    maxTouchPoints: env.maxTouchPoints ?? 0,
  });

  const fakeWindow: Record<string, unknown> = {
    matchMedia: (query: string) => ({
      matches: query.includes("coarse") ? Boolean(env.coarsePointer) : false,
      addEventListener() {},
      removeEventListener() {},
    }),
    addEventListener() {},
    removeEventListener() {},
  };
  if (env.hasOnTouchStart) fakeWindow.ontouchstart = null;
  defineGlobal("window", fakeWindow);

  const webglSupported = env.webgl ?? true;
  defineGlobal("document", {
    createElement: () => ({
      getContext: (type: string) =>
        webglSupported && (type === "webgl2" || type === "webgl")
          ? makeGl(env)
          : null,
      remove() {},
    }),
  });
}

afterEach(() => {
  for (const [name, desc] of Object.entries(savedGlobals)) {
    if (desc) Object.defineProperty(globalThis, name, desc);
    else delete (globalThis as Record<string, unknown>)[name];
    delete savedGlobals[name];
  }
  __resetPerformanceTierCacheForTests();
});

describe("getPerformanceTier — off tier (extremely low-end / low-power)", () => {
  test("no WebGL support → off", () => {
    applyEnv({ webgl: false, cores: 8 });
    expect(getPerformanceTier()).toBe("off");
  });

  test("no high-precision floats → off", () => {
    applyEnv({ highp: false, cores: 8 });
    expect(getPerformanceTier()).toBe("off");
  });

  test("tiny max texture size → off", () => {
    applyEnv({ textureSize: 2048, cores: 8 });
    expect(getPerformanceTier()).toBe("off");
  });

  test("very low core count → off", () => {
    applyEnv({ cores: 2 });
    expect(getPerformanceTier()).toBe("off");
  });

  test("very low device memory → off", () => {
    applyEnv({ cores: 8, memory: 1 });
    expect(getPerformanceTier()).toBe("off");
  });
});

describe("getPerformanceTier — reduced tier (phones, tablets, mid PCs)", () => {
  test("phone (touch + coarse pointer, capable GPU) → reduced, not off", () => {
    applyEnv({
      cores: 8,
      maxTouchPoints: 5,
      coarsePointer: true,
      anisotropy: 16,
      textureSize: 8192,
    });
    expect(getPerformanceTier()).toBe("reduced");
  });

  test("tablet (coarse pointer, many cores) → reduced", () => {
    applyEnv({
      cores: 8,
      hasOnTouchStart: true,
      coarsePointer: true,
      anisotropy: 16,
      textureSize: 16384,
    });
    expect(getPerformanceTier()).toBe("reduced");
  });

  test("mid desktop with too few cores for full → reduced", () => {
    applyEnv({ cores: 4, anisotropy: 16, textureSize: 16384 });
    expect(getPerformanceTier()).toBe("reduced");
  });

  test("desktop with weak GPU anisotropy → reduced", () => {
    applyEnv({ cores: 8, anisotropy: 2, textureSize: 16384 });
    expect(getPerformanceTier()).toBe("reduced");
  });
});

describe("getPerformanceTier — full tier (performance PC)", () => {
  test("non-touch desktop with strong CPU + GPU → full", () => {
    applyEnv({
      cores: 8,
      anisotropy: 16,
      textureSize: 16384,
      coarsePointer: false,
      maxTouchPoints: 0,
    });
    expect(getPerformanceTier()).toBe("full");
  });

  test("touch-capable laptop with fine primary pointer → full", () => {
    // Touch laptop: has touch points but primary pointer is fine (trackpad).
    applyEnv({
      cores: 12,
      anisotropy: 16,
      textureSize: 16384,
      maxTouchPoints: 10,
      coarsePointer: false,
    });
    expect(getPerformanceTier()).toBe("full");
  });
});

describe("isMobileDevice", () => {
  test("touch + coarse pointer → mobile", () => {
    applyEnv({ maxTouchPoints: 5, coarsePointer: true });
    expect(isMobileDevice()).toBe(true);
  });

  test("touch + fine pointer (touch laptop) → not mobile", () => {
    applyEnv({ maxTouchPoints: 10, coarsePointer: false });
    expect(isMobileDevice()).toBe(false);
  });

  test("no touch → not mobile", () => {
    applyEnv({ maxTouchPoints: 0, coarsePointer: true });
    expect(isMobileDevice()).toBe(false);
  });
});
