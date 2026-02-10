#!/usr/bin/env bun
/**
 * Wiring tests for quality report markdown summary renderer.
 *
 * Why:
 * Ensures `scripts/quality-report-summary.ts` remains stable for both pass/fail
 * report shapes used by CI and local tooling.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  header,
  section,
  runTest,
  printSummary,
  clearResults,
  assert,
  assertEq,
} from "./test-utils";

const runSummary = (reportPath: string) =>
  spawnSync("bun", ["run", "scripts/quality-report-summary.ts", reportPath], {
    cwd: process.cwd(),
    encoding: "utf-8",
    stdio: "pipe",
  });

const withTempReport = (
  report: object,
  testFn: (reportPath: string) => void
): void => {
  const dir = mkdtempSync(join(tmpdir(), "ryos-quality-summary-"));
  const path = join(dir, "quality-report.json");
  writeFileSync(path, JSON.stringify(report, null, 2), "utf-8");
  try {
    testFn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

export async function runQualitySummaryWiringTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Quality Summary Wiring Tests"));

  console.log(section("Passing report rendering"));
  await runTest("renders markdown table for passing report", async () => {
    withTempReport(
      {
        root: "/tmp/example",
        passed: true,
        checks: [
          {
            name: "eslint-disable comments",
            status: "PASS",
            value: 0,
            allowed: "<= 0",
          },
        ],
      },
      (reportPath) => {
        const result = runSummary(reportPath);
        assertEq(result.status, 0, `Expected exit 0, got ${result.status}`);
        const out = result.stdout || "";
        assert(out.includes("## Quality Guardrails Report"), "Missing heading");
        assert(out.includes("- Overall: ✅ PASS"), "Missing pass overall row");
        assert(out.includes("| Check | Status | Value | Allowed |"), "Missing table header");
        assert(out.includes("eslint-disable comments"), "Missing check row");
      }
    );
  });

  console.log(section("Failing report rendering"));
  await runTest("includes failed check metadata for failing report", async () => {
    withTempReport(
      {
        root: "/tmp/example",
        passed: false,
        checks: [
          {
            name: "TODO/FIXME/HACK markers",
            status: "FAIL",
            value: 2,
            allowed: "<= 0",
          },
          {
            name: "eslint-disable comments",
            status: "PASS",
            value: 0,
            allowed: "<= 0",
          },
        ],
      },
      (reportPath) => {
        const result = runSummary(reportPath);
        assertEq(result.status, 0, `Expected exit 0, got ${result.status}`);
        const out = result.stdout || "";
        assert(out.includes("- Overall: ❌ FAIL"), "Missing fail overall row");
        assert(out.includes("- Failed checks: 1"), "Missing failed check count");
        assert(
          out.includes("- Failed check names: TODO/FIXME/HACK markers"),
          "Missing failed check names list"
        );
      }
    );
  });

  return printSummary();
}

if (import.meta.main) {
  runQualitySummaryWiringTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
