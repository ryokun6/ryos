import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  collectStaticImportGraph,
  findStaticImportChain,
} from "../../../scripts/trace-import-chain";

/**
 * Boot-bundle guard: heavy modules must never be statically reachable from the
 * client entry (`src/main.tsx`). A static chain to any of these pulls its
 * whole dependency graph (three, react-player, romanization libs, the iPod /
 * Karaoke / finder store stacks, …) into the entry chunk, which every visitor
 * downloads and parses before first paint.
 *
 * These must only load through dynamic import() — lazy app components, the
 * code-split dynamic wallpaper layers, or the deferred idle runners. If one of
 * these assertions fails, the printed chain shows exactly which import to fix
 * (usually by lazy-loading the component or importing a type with
 * `import type`).
 */
const FORBIDDEN_BOOT_MODULES: Array<{ target: string; reason: string }> = [
  {
    target: "stores/useIpodStore",
    reason: "iPod store (~2700 lines) — only needed for music playback",
  },
  {
    target: "stores/useKaraokeStore",
    reason: "Karaoke store — only needed for karaoke playback",
  },
  {
    target: "finder/hooks/useFileSystem",
    reason:
      "full finder VFS hook (~1800 lines) — deferred via DeferredAirDropListener",
  },
  {
    target: "shared/WeatherShaderBackground",
    reason: "pulls the three.js chunk (~465KB) at boot",
  },
  {
    target: "shared/YouTubePlayer",
    reason: "pulls the react-player (media-player) chunk at boot",
  },
  {
    target: "karaoke-app/KaraokeVisualLayers",
    reason: "pulls three.js visual backgrounds at boot",
  },
  {
    target: "lyrics-display/LyricsDisplay",
    reason: "pulls pinyin-pro / wanakana / hangul romanization at boot",
  },
  {
    target: "utils/romanization",
    reason: "pinyin-pro / wanakana / hangul-romanization libs",
  },
  {
    target: "debug/DebugLogOverlay",
    reason: "debug-mode-only overlay — lazily mounted from App",
  },
  {
    target: "hooks/useAutoCloudSync",
    reason: "cloud sync engine — deferred via DeferredAutoCloudSync",
  },
  {
    target: "hooks/useBackgroundChatNotifications",
    reason: "authenticated realtime notifications — deferred until idle",
  },
  {
    target: "stores/ipodPreload",
    reason: "idle-only iPod catalog warming",
  },
  {
    target: "utils/prefetch",
    reason: "idle-only offline asset warming",
  },
  {
    target: "utils/pwaRegistration",
    reason: "service-worker registration is deferred until idle",
  },
];

describe("boot import graph", () => {
  for (const { target, reason } of FORBIDDEN_BOOT_MODULES) {
    test(`src/main.tsx must not statically import ${target}`, () => {
      const chain = findStaticImportChain(target);
      if (chain) {
        throw new Error(
          `"${target}" (${reason}) is statically reachable from src/main.tsx:\n  ` +
            chain.join("\n  -> ")
        );
      }
      expect(chain).toBeNull();
    });
  }

  test("sanity: the tracer still resolves real chains", () => {
    // App.tsx is trivially reachable; guards against the tracer silently
    // failing to parse imports (which would green-light everything above).
    const chain = findStaticImportChain("src/App.tsx");
    expect(chain).not.toBeNull();
    expect(chain![0]).toBe("src/main.tsx");
  });

  test("vite does not force AI SDK packages into a shared manual chunk", async () => {
    // Putting `ai` / `@ai-sdk/react` in manualChunks lets Rolldown colocate
    // React into that chunk, which then modulepreloads at boot and can
    // black-screen the #000 html/body if the chunk fails to evaluate.
    const config = await Bun.file("vite.config.ts").text();
    expect(config).not.toMatch(/["']@ai-sdk\/react["']\s*:\s*["']ai-sdk["']/);
    expect(config).not.toMatch(/\bai:\s*["']ai-sdk["']/);
  });

  test("boot-reachable source files must not runtime-import AI SDK packages", () => {
    // A runtime `from "ai"` / `@ai-sdk/*` on the static boot graph pulls the
    // SDK (and, after the 7.0.113 bump, MCP-app code) into the entry evaluate
    // path. html/body are #000, so a throw there is a black screen.
    const bootFiles = collectStaticImportGraph();
    expect(bootFiles.length).toBeGreaterThan(20);
    expect(bootFiles).toContain("src/main.tsx");

    // Ban both `import { X } from "ai"` and `import { type X } from "ai"`.
    // `import type` is erased and is the only allowed form on the boot graph.
    const runtimeAiImport =
      /(?:^|\n)\s*import\s+(?!type\b)[^"'()]*?from\s*["'](ai|@ai-sdk\/[^"']+)["']/;
    const offenders = bootFiles.filter((file) => {
      if (!file.match(/\.(ts|tsx|js|jsx)$/)) return false;
      return runtimeAiImport.test(readFileSync(file, "utf-8"));
    });
    expect(offenders).toEqual([]);
  });
});
