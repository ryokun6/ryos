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
        totalChecks: 1,
        failedChecks: 0,
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
        totalChecks: 3,
        failedChecks: 2,
        checks: [
          {
            name: "TODO/FIXME/HACK markers",
            status: "FAIL",
            value: 6,
            allowed: "<= 0",
            offenders: [
              { path: "src/a.ts", count: 1 },
              { path: "src/b.ts", count: 1 },
              { path: "src/c.ts", count: 1 },
              { path: "src/d.ts", count: 1 },
              { path: "src/e.ts", count: 1 },
              { path: "src/f.ts", count: 1 },
            ],
          },
          {
            name: "eslint-disable comments",
            status: "PASS",
            value: 0,
            allowed: "<= 0",
          },
          {
            name: "large TypeScript files",
            status: "FAIL",
            value: 1,
            allowed: "files <= 14; largest <= 2600",
            offenders: [{ path: "src/Huge.ts", count: 1701 }],
          },
        ],
      },
      (reportPath) => {
        const result = runSummary(reportPath);
        assertEq(result.status, 0, `Expected exit 0, got ${result.status}`);
        const out = result.stdout || "";
        assert(out.includes("- Overall: ❌ FAIL"), "Missing fail overall row");
        assert(out.includes("- Failed checks: 2"), "Missing failed check count");
        assert(
          out.includes("- Failed check names:"),
          "Missing failed check names list"
        );
        assert(
          out.includes("TODO/FIXME/HACK markers") &&
            out.includes("large TypeScript files"),
          "Missing expected failed check names"
        );
        assert(
          out.includes("### Failed check offenders (top 5 each)"),
          "Missing failed offender heading"
        );
        assert(
          out.includes("- **TODO/FIXME/HACK markers**"),
          "Missing failed offender check heading"
        );
        assert(
          out.includes("`src/a.ts` (1)") &&
            out.includes("`src/b.ts` (1)") &&
            out.includes("`src/e.ts` (1)"),
          "Missing failed offender rows"
        );
        assert(
          !out.includes("`src/f.ts` (1)"),
          "Expected failed offender preview to be capped at 5 rows"
        );
        assert(
          out.includes("`src/Huge.ts` (1701)"),
          "Missing failed file-size offender row"
        );
      }
    );
  });

  console.log(section("Input validation"));
  await runTest("fails with helpful error on malformed report", async () => {
    withTempReport(
      {
        root: "/tmp/example",
        passed: true,
        checks: "not-an-array",
      },
      (reportPath) => {
        const result = runSummary(reportPath);
        assertEq(result.status, 1, `Expected exit 1, got ${result.status}`);
        const err = result.stderr || "";
        assert(
          err.includes("Failed to render quality report summary:"),
          "Expected renderer failure prefix in stderr"
        );
        assert(
          err.includes("checks array"),
          "Expected malformed checks-array validation error"
        );
      }
    );
  });

  await runTest("fails when metadata and checks are inconsistent", async () => {
    withTempReport(
      {
        root: "/tmp/example",
        passed: false,
        totalChecks: 2,
        failedChecks: 0,
        checks: [
          {
            name: "TODO/FIXME/HACK markers",
            status: "FAIL",
            value: 1,
            allowed: "<= 0",
          },
        ],
      },
      (reportPath) => {
        const result = runSummary(reportPath);
        assertEq(result.status, 1, `Expected exit 1, got ${result.status}`);
        const err = result.stderr || "";
        assert(
          err.includes("metadata"),
          "Expected metadata mismatch validation error"
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
