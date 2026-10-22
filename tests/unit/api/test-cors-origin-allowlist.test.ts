import { afterEach, describe, expect, test } from "bun:test";
import { isAllowedOrigin } from "../../../api/_utils/_cors";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
});

describe("CORS localhost allowlist", () => {
  test("allows localhost app served on port 3001 in development", () => {
    delete process.env.API_ALLOWED_ORIGINS;
    delete process.env.API_RUNTIME_ENV;
    delete process.env.API_ENV;
    delete process.env.NODE_ENV;

    expect(isAllowedOrigin("http://localhost:3001")).toBe(true);
  });

  test("keeps unknown localhost ports blocked by default", () => {
    delete process.env.API_ALLOWED_ORIGINS;
    delete process.env.API_RUNTIME_ENV;
    delete process.env.API_ENV;
    delete process.env.NODE_ENV;

    expect(isAllowedOrigin("http://localhost:3999")).toBe(false);
  });
});

describe("CORS hardening", () => {
  const setProd = () => {
    delete process.env.API_RUNTIME_ENV;
    delete process.env.API_ENV;
    process.env.NODE_ENV = "production";
  };
  const setDev = () => {
    delete process.env.API_RUNTIME_ENV;
    delete process.env.API_ENV;
    delete process.env.NODE_ENV;
  };

  test("ignores API_ALLOWED_ORIGINS=* in production but keeps other entries", () => {
    setProd();
    process.env.API_ALLOWED_ORIGINS = "*, https://os.example.com";
    expect(isAllowedOrigin("https://evil.example")).toBe(false);
    expect(isAllowedOrigin("https://os.example.com")).toBe(true);
  });

  test("still honors API_ALLOWED_ORIGINS=* in development", () => {
    setDev();
    process.env.API_ALLOWED_ORIGINS = "*";
    expect(isAllowedOrigin("https://anything.example")).toBe(true);
  });

  test("tailnet origins are dev-only unless a suffix is configured", () => {
    delete process.env.API_ALLOWED_ORIGINS;
    delete process.env.API_TAILNET_ORIGIN_SUFFIX;
    setProd();
    expect(isAllowedOrigin("https://box.tailb4fa61.ts.net")).toBe(false);

    process.env.API_TAILNET_ORIGIN_SUFFIX = ".tailb4fa61.ts.net";
    expect(isAllowedOrigin("https://box.tailb4fa61.ts.net")).toBe(true);
    expect(isAllowedOrigin("https://box.tailother.ts.net")).toBe(false);

    delete process.env.API_TAILNET_ORIGIN_SUFFIX;
    setDev();
    expect(isAllowedOrigin("https://box.tailb4fa61.ts.net")).toBe(true);

    process.env.API_TAILNET_ORIGIN_SUFFIX = "off";
    expect(isAllowedOrigin("https://box.tailb4fa61.ts.net")).toBe(false);
  });

  test("wildcard entries only match https origins in production", () => {
    setProd();
    process.env.API_ALLOWED_ORIGINS = "*.example.com";
    expect(isAllowedOrigin("https://dev.example.com")).toBe(true);
    expect(isAllowedOrigin("http://dev.example.com")).toBe(false);
  });

  test("never allows the isolated IE proxy origin, even through a wildcard", () => {
    setProd();
    process.env.API_ALLOWED_ORIGINS = "https://os.example.com, *.example.com";
    process.env.IE_PROXY_ORIGIN = "https://ieproxy.example.com";
    expect(isAllowedOrigin("https://ieproxy.example.com")).toBe(false);
    expect(isAllowedOrigin("https://dev.example.com")).toBe(true);
  });
});
