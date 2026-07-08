import { describe, expect, test } from "bun:test";
import { collectOfflinePrecacheChunkClosure } from "../vite/precachePolicy";

describe("Workbox precache policy", () => {
  test("keeps the shell, apps, locales, and their static dependencies", () => {
    const closure = collectOfflinePrecacheChunkClosure([
      {
        fileName: "assets/index.js",
        imports: ["assets/react.js"],
        isEntry: true,
        facadeModuleId: "/workspace/src/main.tsx",
      },
      {
        fileName: "assets/react.js",
        imports: [],
      },
      {
        fileName: "assets/CalculatorApp.js",
        imports: [
          "assets/react.js",
          "assets/ui-core.js",
          "assets/math-vendor.js",
        ],
        facadeModuleId:
          "/workspace/src/apps/calculator/components/CalculatorApp.tsx",
      },
      {
        fileName: "assets/ui-core.js",
        imports: ["assets/react.js"],
      },
      {
        fileName: "assets/math-vendor.js",
        imports: [],
      },
      {
        fileName: "assets/translation-ja.js",
        imports: [],
        facadeModuleId:
          "/workspace/src/lib/locales/ja/translation.json",
      },
      {
        fileName: "assets/mermaid.js",
        imports: [],
        facadeModuleId: "/workspace/node_modules/mermaid/dist/mermaid.js",
      },
      {
        fileName: "assets/BackgroundChatNotificationsRunner.js",
        imports: ["assets/react.js"],
        facadeModuleId:
          "/workspace/src/hooks/BackgroundChatNotificationsRunner.tsx",
      },
    ]);

    expect([...closure].sort()).toEqual([
      "assets/CalculatorApp.js",
      "assets/index.js",
      "assets/math-vendor.js",
      "assets/react.js",
      "assets/translation-ja.js",
      "assets/ui-core.js",
    ]);
  });
});
