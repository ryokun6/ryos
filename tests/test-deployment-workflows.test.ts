import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readWorkflow = (name: string): string =>
  readFileSync(resolve(process.cwd(), ".github/workflows", name), "utf8");

const jobSection = (source: string, job: string, nextJob?: string): string => {
  const end = nextJob ? `(?=\\n  ${nextJob}:)` : "$";
  const match = source.match(new RegExp(`\\n  ${job}:([\\s\\S]*?)${end}`));
  if (!match) {
    throw new Error(`Missing workflow job: ${job}`);
  }
  return match[1];
};

describe("deployment workflow gates", () => {
  const workflow = readWorkflow("build-and-deploy.yml");
  const unit = jobSection(workflow, "test", "build");
  const build = jobSection(workflow, "build", "api-test");
  const api = jobSection(workflow, "api-test", "image");
  const image = jobSection(workflow, "image", "deploy");
  const deploy = jobSection(workflow, "deploy");

  test("checks and tests the exact event SHA without push-only deadlocks", () => {
    for (const check of [unit, build, api]) {
      expect(check).toContain("ref: ${{ github.sha }}");
      expect(check).not.toMatch(/^    if:/m);
    }
  });

  test("runs API integration tests against standalone API and Redis", () => {
    expect(api).toContain("image: redis:7-alpine");
    expect(api).toContain("REDIS_URL: redis://127.0.0.1:6379/0");
    expect(api).toContain("bun run scripts/api-standalone-server.ts");
    expect(api).toContain("bun run test:api");
  });

  test("publishes and deploys only after every exact-SHA gate passes", () => {
    expect(image).toContain("needs: [test, build, api-test]");
    expect(image).toContain("github.event_name == 'push'");
    expect(image).toContain("github.ref == 'refs/heads/main'");
    expect(image).toContain("${IMAGE_NAME}:sha-${GITHUB_SHA}");
    expect(image).not.toContain("${IMAGE_NAME}:latest");
    expect(deploy).toContain("needs: [image]");
    expect(deploy).toContain('image_tag="sha-${COMMIT_SHA}"');
  });
});

describe("Electron release workflow", () => {
  const workflow = readWorkflow("build-electron.yml");
  const windows = jobSection(workflow, "build-windows", "release");
  const release = jobSection(workflow, "release");

  test("publishes only signed version-tag builds", () => {
    expect(windows).toContain(
      "Require Windows signing secrets for releases"
    );
    expect(windows).toContain("WINDOWS_CERTIFICATE");
    expect(windows).toContain("WINDOWS_CERTIFICATE_PASSWORD");
    expect(release).toContain("if: startsWith(github.ref, 'refs/tags/v')");
  });
});
