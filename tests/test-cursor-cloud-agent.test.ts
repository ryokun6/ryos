import { describe, expect, test } from "bun:test";
import {
  getAllowedRyosRepoUrls,
  isRepoAllowed,
  normalizeGithubRepoHttpsUrl,
} from "../api/_utils/cursor-cloud-agent";

describe("cursor cloud agent helpers", () => {
  test("normalizes github https repo urls", () => {
    expect(normalizeGithubRepoHttpsUrl("https://github.com/foo/bar")).toBe(
      "https://github.com/foo/bar"
    );
    expect(normalizeGithubRepoHttpsUrl("github.com/foo/bar/")).toBe(
      "https://github.com/foo/bar"
    );
    expect(normalizeGithubRepoHttpsUrl("https://example.com/foo/bar")).toBeNull();
  });

  test("allowlist defaults to public ryOS repo", () => {
    const urls = getAllowedRyosRepoUrls({});
    expect(urls).toEqual(["https://github.com/ryokun6/ryos"]);
  });

  test("allowlist parses comma-separated CURSOR_RYOS_REPO_URLS", () => {
    const urls = getAllowedRyosRepoUrls({
      CURSOR_RYOS_REPO_URLS:
        "https://github.com/a/b, https://github.com/c/d/",
    } as NodeJS.ProcessEnv);
    expect(urls).toEqual(["https://github.com/a/b", "https://github.com/c/d"]);
  });

  test("isRepoAllowed matches normalized github urls", () => {
    const allowed = ["https://github.com/ryokun6/ryos"];
    expect(isRepoAllowed("https://github.com/ryokun6/ryos", allowed)).toBe(true);
    expect(isRepoAllowed("github.com/ryokun6/ryos", allowed)).toBe(true);
    expect(isRepoAllowed("https://github.com/other/repo", allowed)).toBe(false);
  });
});
