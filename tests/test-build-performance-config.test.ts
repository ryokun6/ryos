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
    expect(runner).toContain('["bun", "run", "inspect:precache"]');
    expect(runner.indexOf("failedJobs.length")).toBeLessThan(
      runner.indexOf('["bun", "run", "inspect:precache"]')
    );
  });

  test("enables incremental project-reference caches", () => {
    for (const fileName of ["tsconfig.app.json", "tsconfig.node.json"]) {
      const config = readFileSync(path.join(ROOT, fileName), "utf8");
      expect(config).toContain('"incremental": true');
      expect(config).toContain('"noEmit": true');
      expect(config).not.toContain('"composite": true');
    }
  });

  test("enforces the shell precache budget in the CI build", () => {
    const inspector = readFileSync(
      path.join(ROOT, "scripts/inspect-precache.ts"),
      "utf8"
    );
    const workflow = readFileSync(
      path.join(ROOT, ".github/workflows/build-and-deploy.yml"),
      "utf8"
    );

    expect(inspector).toContain("Offline app budget exceeded");
    expect(inspector).toContain("MAX_FILES");
    expect(inspector).toContain("MAX_SCRIPTS");
    expect(inspector).toContain("MAX_BYTES");
    expect(workflow).toContain("Type check, build, and inspect precache");
    expect(workflow).toContain("run: bun run build");
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
