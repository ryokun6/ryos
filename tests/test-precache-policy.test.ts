import { describe, expect, test } from "bun:test";
import {
  isOptionalPrecacheChunkName,
  shouldExcludePrecacheChunk,
} from "../vite/precachePolicy";

describe("Workbox precache policy", () => {
  test("excludes optional manual vendor chunks by emitted name", () => {
    for (const fileName of [
      "assets/media-player-a1b2.js",
      "assets/mermaid-c3d4.js",
      "assets/three-e5f6.js",
      "assets/ai-sdk-g7h8.js",
    ]) {
      expect(isOptionalPrecacheChunkName(fileName)).toBe(true);
    }
    expect(isOptionalPrecacheChunkName("assets/react-a1b2.js")).toBe(false);
  });

  test("excludes lazy apps and full locale catalogs", () => {
    expect(
      shouldExcludePrecacheChunk({
        fileName: "assets/Calculator-a1b2.js",
        moduleIds: ["/workspace/src/apps/calculator/Calculator.tsx"],
        facadeModuleId: "/workspace/src/apps/calculator/Calculator.tsx",
      })
    ).toBe(true);
    expect(
      shouldExcludePrecacheChunk({
        fileName: "assets/translation-a1b2.js",
        moduleIds: ["/workspace/src/lib/locales/ja/translation.json"],
        facadeModuleId: "/workspace/src/lib/locales/ja/translation.json",
      })
    ).toBe(true);
  });

  test("keeps the shell and catches Streamdown heavy chunks", () => {
    expect(
      shouldExcludePrecacheChunk({
        fileName: "assets/index-a1b2.js",
        moduleIds: ["/workspace/src/main.tsx", "/workspace/src/App.tsx"],
        facadeModuleId: "/workspace/src/main.tsx",
      })
    ).toBe(false);
    expect(
      shouldExcludePrecacheChunk({
        fileName: "assets/code-a1b2.js",
        moduleIds: [
          "/workspace/node_modules/@streamdown/code/dist/index.js",
        ],
        facadeModuleId:
          "/workspace/node_modules/@streamdown/code/dist/index.js",
      })
    ).toBe(true);
  });
});
