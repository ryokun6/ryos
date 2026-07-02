import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

describe("build performance configuration", () => {
  test("runs typechecking and bundling through the parallel build runner", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(ROOT, "package.json"), "utf8")
    ) as { scripts: Record<string, string> };
    expect(packageJson.scripts.build).toBe("bun run scripts/build-app.ts");
    expect(packageJson.scripts.typecheck).toBe("tsc -b");
    expect(packageJson.scripts["build:vite"]).toBe("vite build");

    const runner = readFileSync(
      path.join(ROOT, "scripts/build-app.ts"),
      "utf8"
    );
    expect(runner).toContain('NODE_ENV: "production"');
    expect(runner).toContain("Promise.all");
  });

  test("enables incremental project-reference caches", () => {
    for (const fileName of ["tsconfig.app.json", "tsconfig.node.json"]) {
      const config = JSON.parse(
        readFileSync(path.join(ROOT, fileName), "utf8")
      ) as {
        compilerOptions: {
          composite?: boolean;
          incremental?: boolean;
          noEmit?: boolean;
        };
      };
      expect(config.compilerOptions.composite).toBe(true);
      expect(config.compilerOptions.incremental).toBe(true);
      expect(config.compilerOptions.noEmit).toBe(true);
    }
  });

  test("does not eagerly prebundle lazy wallpaper dependencies", () => {
    const config = readFileSync(path.join(ROOT, "vite.config.ts"), "utf8");
    const optimizeDeps = config.slice(
      config.indexOf("optimizeDeps:"),
      config.indexOf("plugins:")
    );
    for (const dependency of [
      "react-player",
      "pinyin-pro",
      "wanakana",
      "hangul-romanization",
    ]) {
      expect(optimizeDeps).not.toContain(`"${dependency}"`);
    }
  });
});
