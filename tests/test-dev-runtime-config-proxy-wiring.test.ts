import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("dev runtime config proxy wiring", () => {
  test("full-stack dev script passes standalone API proxy target to Vite", () => {
    const source = readSource("scripts/dev-with-api.ts");

    expect(source.includes("STANDALONE_API_PROXY_TARGET")).toBe(true);
    expect(source.includes("http://localhost:${API_PORT}")).toBe(true);
  });

  test("Vite proxies runtime config from the standalone API", () => {
    const source = readSource("vite.config.ts");

    expect(source.includes('"/app-config.js"')).toBe(true);
    expect(source.includes('target: standaloneApiProxyTarget')).toBe(true);
  });

  test("HTML bootstrap loads runtime config before the app bundle", () => {
    const source = readSource("index.html");

    expect(source.includes('<script src="/app-config.js"></script>')).toBe(true);
    expect(
      source.indexOf('<script src="/app-config.js"></script>') <
        source.indexOf('<script type="module" src="/src/main.tsx"></script>')
    ).toBe(true);
  });
});
