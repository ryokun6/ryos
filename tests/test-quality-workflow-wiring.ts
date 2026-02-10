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
  });

  await runTest("workflow pins Bun setup action", async () => {
    const source = readWorkflow();
    assert(
      /uses:\s*oven-sh\/setup-bun@v2/.test(source),
      "Expected setup-bun action"
    );
    assert(/bun-version:\s*"1\.3\.5"/.test(source), "Expected Bun version pin");
  });

  console.log(section("Quality execution parity"));
  await runTest("workflow runs consolidated local quality command", async () => {
    const source = readWorkflow();
    assert(
      /run:\s*bun run quality:all/.test(source),
      "Expected CI to run bun run quality:all"
    );
  });

  await runTest("workflow emits JSON report and markdown summary", async () => {
    const source = readWorkflow();
    assert(
      /run:\s*bun run quality:check:json > quality-report\.json/.test(source),
      "Expected JSON quality report generation step"
    );
    assert(
      /run:\s*bun run quality:summary quality-report\.json >> "\$GITHUB_STEP_SUMMARY"/.test(
        source
      ),
      "Expected markdown summary publish step"
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
