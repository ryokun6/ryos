import { afterEach, describe, expect, test } from "bun:test";
import { isAllowedOrigin } from "../api/_utils/_cors";

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
    delete process.env.VERCEL_ENV;
    delete process.env.NODE_ENV;

    expect(isAllowedOrigin("http://localhost:3001")).toBe(true);
  });

  test("keeps unknown localhost ports blocked by default", () => {
    delete process.env.API_ALLOWED_ORIGINS;
    delete process.env.API_RUNTIME_ENV;
    delete process.env.API_ENV;
    delete process.env.VERCEL_ENV;
    delete process.env.NODE_ENV;

    expect(isAllowedOrigin("http://localhost:3999")).toBe(false);
  });
});
