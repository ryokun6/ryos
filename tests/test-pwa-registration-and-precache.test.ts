import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

describe("PWA startup policy", () => {
  test("registers the service worker from the idle bootstrap queue", () => {
    const mainSource = readFileSync(
      path.join(ROOT, "src/main.tsx"),
      "utf8"
    );
    expect(mainSource).toContain('import("./utils/pwaRegistration")');
    expect(mainSource).not.toMatch(
      /^import .* from ["'].+pwaRegistration["'];?$/m
    );

    const config = readFileSync(
      path.join(ROOT, "vite.config.ts"),
      "utf8"
    );
    expect(config).toContain("injectRegister: false");
  });

  test("does not precache every font file twice", () => {
    const config = readFileSync(
      path.join(ROOT, "vite.config.ts"),
      "utf8"
    );
    expect(config).toContain('"fonts/fonts.css"');
    expect(config).not.toContain('"fonts/*.woff2"');
  });
});
