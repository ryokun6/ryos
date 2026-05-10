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

describe("Vercel preview origin allowlist", () => {
  test("allows preview hostnames on the trusted team", () => {
    delete process.env.API_ALLOWED_ORIGINS;
    delete process.env.API_VERCEL_PREVIEW_TEAM_SUFFIXES;
    process.env.API_RUNTIME_ENV = "preview";

    expect(
      isAllowedOrigin("https://ryos-abc123-ryo-lu.vercel.app")
    ).toBe(true);
    expect(
      isAllowedOrigin("https://ryos-git-feature-x-ryo-lu.vercel.app")
    ).toBe(true);
  });

  test("blocks preview hostnames from other Vercel teams", () => {
    delete process.env.API_ALLOWED_ORIGINS;
    delete process.env.API_VERCEL_PREVIEW_TEAM_SUFFIXES;
    process.env.API_RUNTIME_ENV = "preview";

    // Project named "ryos-evil" on a different team — used to be
    // allow-listed by the old prefix-based check.
    expect(
      isAllowedOrigin("https://ryos-evil-abc123-attacker.vercel.app")
    ).toBe(false);
    // Generic vercel project that happens to contain the prefix.
    expect(
      isAllowedOrigin("https://ryos-clone-xyz789-someone.vercel.app")
    ).toBe(false);
    // Bare vercel.app domain.
    expect(isAllowedOrigin("https://anything.vercel.app")).toBe(false);
  });

  test("honours API_VERCEL_PREVIEW_TEAM_SUFFIXES override", () => {
    delete process.env.API_ALLOWED_ORIGINS;
    process.env.API_RUNTIME_ENV = "preview";
    process.env.API_VERCEL_PREVIEW_TEAM_SUFFIXES = "my-team, other-team";

    expect(
      isAllowedOrigin("https://proj-abc-my-team.vercel.app")
    ).toBe(true);
    expect(
      isAllowedOrigin("https://proj-abc-other-team.vercel.app")
    ).toBe(true);
    expect(
      isAllowedOrigin("https://proj-abc-ryo-lu.vercel.app")
    ).toBe(false);
  });
});
