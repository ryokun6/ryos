#!/usr/bin/env bun
/**
 * Wiring tests for the code-quality CI workflow.
 *
 * Why:
 * Ensures local quality automation and CI stay aligned. If workflow commands
 * drift, quality guarantees can silently degrade.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  header,
  section,
  runTest,
  printSummary,
  clearResults,
  assert,
} from "./test-utils";

const readWorkflow = (): string =>
  readFileSync(
    resolve(process.cwd(), ".github/workflows/code-quality.yml"),
    "utf-8"
  );

const readPackageScripts = (): Record<string, string> => {
  const raw = readFileSync(resolve(process.cwd(), "package.json"), "utf-8");
  const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
  return parsed.scripts || {};
};

export async function runQualityWorkflowWiringTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Quality Workflow Wiring Tests"));

  console.log(section("Core CI structure"));
  await runTest("workflow targets pull requests and pushes", async () => {
    const source = readWorkflow();
    assert(/on:\s*\n\s*pull_request:/m.test(source), "Expected pull_request trigger");
    assert(/on:\s*[\s\S]*\n\s*push:/m.test(source), "Expected push trigger");
    assert(
      /push:\s*[\s\S]*branches:\s*[\s\S]*-\s*main/m.test(source),
      "Expected push trigger to include main branch"
    );
    assert(
      /push:\s*[\s\S]*branches:\s*[\s\S]*-\s*cursor\/\*\*/m.test(source),
      "Expected push trigger to include cursor/** branches"
    );
  });

  await runTest("workflow pins Bun setup action", async () => {
    const source = readWorkflow();
    assert(
      /uses:\s*oven-sh\/setup-bun@v2/.test(source),
      "Expected setup-bun action"
    );
    assert(/bun-version:\s*"1\.3\.5"/.test(source), "Expected Bun version pin");
  });

  await runTest("workflow job runtime settings are explicit", async () => {
    const source = readWorkflow();
    assert(/runs-on:\s*ubuntu-latest/.test(source), "Expected ubuntu-latest runner");
    assert(/timeout-minutes:\s*20/.test(source), "Expected explicit timeout-minutes");
    assert(
      /concurrency:\s*[\s\S]*cancel-in-progress:\s*true/m.test(source),
      "Expected workflow concurrency cancel-in-progress guard"
    );
  });

  console.log(section("Quality execution parity"));
  await runTest("workflow runs consolidated local quality command", async () => {
    const source = readWorkflow();
    assert(
      /run:\s*bun run quality:all:ci/.test(source),
      "Expected CI to run bun run quality:all:ci"
    );
  });

  await runTest("workflow quality command exists in package scripts", async () => {
    const scripts = readPackageScripts();
    assert(
      typeof scripts["quality:all:ci"] === "string" &&
        scripts["quality:all:ci"].length > 0,
      "Expected package.json to define quality:all:ci used by workflow"
    );
  });

  await runTest("workflow avoids duplicated inline quality commands", async () => {
    const source = readWorkflow();
    assert(
      !/run:\s*bunx eslint \. --max-warnings 0/.test(source),
      "Expected workflow to avoid duplicating lint command inline"
    );
    assert(
      !/run:\s*bun run build/.test(source),
      "Expected workflow to avoid duplicating build command inline"
    );
  });

  await runTest("workflow emits markdown summary from generated JSON report", async () => {
    const source = readWorkflow();
    assert(
      !/Generate quality report JSON/.test(source),
      "Expected JSON generation to be consolidated into quality:all:ci"
    );
    assert(
      !/run:\s*bun run quality:check:json > quality-report\.json/.test(source),
      "Expected no standalone quality:check:json workflow step"
    );
    assert(
      /bun run quality:summary quality-report\.json >> "\$GITHUB_STEP_SUMMARY"/.test(
        source
      ) && /quality-report\.json was not generated\./.test(source),
      "Expected markdown summary publish step"
    );
    assert(
      /Publish quality summary[\s\S]*if:\s*always\(\)/.test(source),
      "Expected summary generation to run with if: always()"
    );
  });

  await runTest("workflow uploads quality report artifact", async () => {
    const source = readWorkflow();
    assert(
      /uses:\s*actions\/upload-artifact@v4/.test(source),
      "Expected upload-artifact action"
    );
    assert(/name:\s*quality-report/.test(source), "Expected artifact name quality-report");
    assert(/path:\s*quality-report\.json/.test(source), "Expected artifact path quality-report.json");
    assert(
      /if-no-files-found:\s*ignore/.test(source),
      "Expected artifact upload to ignore missing file edge cases"
    );
  });

  return printSummary();
}

if (import.meta.main) {
  runQualityWorkflowWiringTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
