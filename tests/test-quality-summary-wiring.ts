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
        schemaVersion: 1,
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
        assert(out.includes("- Schema version: 1"), "Missing schema version line");
        assert(out.includes("- Overall: ✅ PASS"), "Missing pass overall row");
        assert(out.includes("| Check | Status | Value | Allowed |"), "Missing table header");
        assert(out.includes("eslint-disable comments"), "Missing check row");
      }
    );
  });

  await runTest("derives count metadata when optional fields are omitted", async () => {
    withTempReport(
      {
        root: "/tmp/example",
        passed: false,
        checks: [
          {
            name: "merge conflict markers",
            status: "FAIL",
            value: 1,
            allowed: "<= 0",
            offenders: [{ path: "src/conflict.ts", count: 1 }],
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
        assert(
          !out.includes("- Schema version:"),
          "Expected schema version line to be omitted when absent"
        );
        assert(out.includes("- Total checks: 2"), "Expected derived total checks count");
        assert(out.includes("- Failed checks: 1"), "Expected derived failed checks count");
      }
    );
  });

  console.log(section("Failing report rendering"));
  await runTest("includes failed check metadata for failing report", async () => {
    withTempReport(
      {
        schemaVersion: 1,
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
        schemaVersion: 0,
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
          err.includes("schemaVersion"),
          "Expected schemaVersion validation error"
        );
      }
    );
  });

  await runTest("fails with helpful error when checks is not an array", async () => {
    withTempReport(
      {
        schemaVersion: 1,
        root: "/tmp/example",
        passed: true,
        checks: "not-an-array",
      },
      (reportPath) => {
        const result = runSummary(reportPath);
        assertEq(result.status, 1, `Expected exit 1, got ${result.status}`);
        const err = result.stderr || "";
        assert(
          err.includes("checks array"),
          "Expected malformed checks-array validation error"
        );
      }
    );
  });

  await runTest("fails when checks array is empty", async () => {
    withTempReport(
      {
        schemaVersion: 1,
        root: "/tmp/example",
        passed: true,
        checks: [],
      },
      (reportPath) => {
        const result = runSummary(reportPath);
        assertEq(result.status, 1, `Expected exit 1, got ${result.status}`);
        const err = result.stderr || "";
        assert(
          err.includes("must not be empty"),
          "Expected empty checks-array validation error"
        );
      }
    );
  });

  await runTest("fails when schemaVersion is invalid or unsupported", async () => {
    withTempReport(
      {
        schemaVersion: "v1",
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
        assertEq(result.status, 1, `Expected exit 1, got ${result.status}`);
        const err = result.stderr || "";
        assert(
          err.includes("schemaVersion"),
          "Expected schemaVersion validation error for non-integer values"
        );
      }
    );
  });

  await runTest("fails when schemaVersion is unsupported integer", async () => {
    withTempReport(
      {
        schemaVersion: 2,
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
        assertEq(result.status, 1, `Expected exit 1, got ${result.status}`);
        const err = result.stderr || "";
        assert(
          err.includes("schemaVersion"),
          "Expected schemaVersion validation error for unsupported version"
        );
      }
    );
  });

  await runTest("fails when metadata and checks are inconsistent", async () => {
    withTempReport(
      {
        schemaVersion: 1,
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
            offenders: [{ path: "src/a.ts", count: 1 }],
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

  await runTest("fails when passed metadata conflicts with failed statuses", async () => {
    withTempReport(
      {
        schemaVersion: 1,
        root: "/tmp/example",
        passed: true,
        checks: [
          {
            name: "merge conflict markers",
            status: "FAIL",
            value: 1,
            allowed: "<= 0",
            offenders: [{ path: "src/conflict.ts", count: 1 }],
          },
        ],
      },
      (reportPath) => {
        const result = runSummary(reportPath);
        assertEq(result.status, 1, `Expected exit 1, got ${result.status}`);
        const err = result.stderr || "";
        assert(
          err.includes("passed metadata"),
          "Expected passed/failed consistency validation error"
        );
      }
    );
  });

  await runTest("fails when offender entries have invalid shape", async () => {
    withTempReport(
      {
        schemaVersion: 1,
        root: "/tmp/example",
        passed: false,
        checks: [
          {
            name: "merge conflict markers",
            status: "FAIL",
            value: 1,
            allowed: "<= 0",
            offenders: [{ path: "", count: 0 }],
          },
        ],
      },
      (reportPath) => {
        const result = runSummary(reportPath);
        assertEq(result.status, 1, `Expected exit 1, got ${result.status}`);
        const err = result.stderr || "";
        assert(
          err.includes("offender"),
          "Expected offender schema validation error"
        );
      }
    );
  });

  await runTest("fails when check value is negative or non-integer", async () => {
    withTempReport(
      {
        schemaVersion: 1,
        root: "/tmp/example",
        passed: false,
        checks: [
          {
            name: "merge conflict markers",
            status: "FAIL",
            value: -1,
            allowed: "<= 0",
          },
        ],
      },
      (reportPath) => {
        const result = runSummary(reportPath);
        assertEq(result.status, 1, `Expected exit 1, got ${result.status}`);
        const err = result.stderr || "";
        assert(
          err.includes("non-negative integer value"),
          "Expected check value validation error"
        );
      }
    );
  });

  await runTest("fails when pass check includes offender rows", async () => {
    withTempReport(
      {
        schemaVersion: 1,
        root: "/tmp/example",
        passed: true,
        checks: [
          {
            name: "eslint-disable comments",
            status: "PASS",
            value: 0,
            allowed: "<= 0",
            offenders: [{ path: "src/a.ts", count: 1 }],
          },
        ],
      },
      (reportPath) => {
        const result = runSummary(reportPath);
        assertEq(result.status, 1, `Expected exit 1, got ${result.status}`);
        const err = result.stderr || "";
        assert(
          err.includes("must not include offenders when PASS"),
          "Expected PASS-offender validation error"
        );
      }
    );
  });

  await runTest("fails when check names are duplicated", async () => {
    withTempReport(
      {
        schemaVersion: 1,
        root: "/tmp/example",
        passed: true,
        checks: [
          {
            name: "eslint-disable comments",
            status: "PASS",
            value: 0,
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
        assertEq(result.status, 1, `Expected exit 1, got ${result.status}`);
        const err = result.stderr || "";
        assert(
          err.includes("duplicate check name"),
          "Expected duplicate check-name validation error"
        );
      }
    );
  });

  await runTest("fails when root field is whitespace-only", async () => {
    withTempReport(
      {
        schemaVersion: 1,
        root: "   ",
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
        assertEq(result.status, 1, `Expected exit 1, got ${result.status}`);
        const err = result.stderr || "";
        assert(
          err.includes("non-empty root"),
          "Expected root non-empty validation error"
        );
      }
    );
  });

  await runTest("fails when check name is whitespace-only", async () => {
    withTempReport(
      {
        schemaVersion: 1,
        root: "/tmp/example",
        passed: true,
        checks: [
          {
            name: "   ",
            status: "PASS",
            value: 0,
            allowed: "<= 0",
          },
        ],
      },
      (reportPath) => {
        const result = runSummary(reportPath);
        assertEq(result.status, 1, `Expected exit 1, got ${result.status}`);
        const err = result.stderr || "";
        assert(err.includes("must include a name"), "Expected check-name validation error");
      }
    );
  });

  await runTest("fails when allowed text is whitespace-only", async () => {
    withTempReport(
      {
        schemaVersion: 1,
        root: "/tmp/example",
        passed: true,
        checks: [
          {
            name: "eslint-disable comments",
            status: "PASS",
            value: 0,
            allowed: "   ",
          },
        ],
      },
      (reportPath) => {
        const result = runSummary(reportPath);
        assertEq(result.status, 1, `Expected exit 1, got ${result.status}`);
        const err = result.stderr || "";
        assert(
          err.includes("must include allowed text"),
          "Expected allowed-text validation error"
        );
      }
    );
  });

  await runTest("fails when offender paths are duplicated within a check", async () => {
    withTempReport(
      {
        schemaVersion: 1,
        root: "/tmp/example",
        passed: false,
        checks: [
          {
            name: "merge conflict markers",
            status: "FAIL",
            value: 2,
            allowed: "<= 0",
            offenders: [
              { path: "src/a.ts", count: 1 },
              { path: "src/a.ts", count: 1 },
            ],
          },
        ],
      },
      (reportPath) => {
        const result = runSummary(reportPath);
        assertEq(result.status, 1, `Expected exit 1, got ${result.status}`);
        const err = result.stderr || "";
        assert(
          err.includes("duplicate offender path"),
          "Expected duplicate offender-path validation error"
        );
      }
    );
  });

  await runTest("fails when offender path is whitespace-only", async () => {
    withTempReport(
      {
        schemaVersion: 1,
        root: "/tmp/example",
        passed: false,
        checks: [
          {
            name: "merge conflict markers",
            status: "FAIL",
            value: 1,
            allowed: "<= 0",
            offenders: [{ path: "   ", count: 1 }],
          },
        ],
      },
      (reportPath) => {
        const result = runSummary(reportPath);
        assertEq(result.status, 1, `Expected exit 1, got ${result.status}`);
        const err = result.stderr || "";
        assert(
          err.includes("invalid path"),
          "Expected whitespace offender-path validation error"
        );
      }
    );
  });

  await runTest("fails when offender paths are not sorted", async () => {
    withTempReport(
      {
        schemaVersion: 1,
        root: "/tmp/example",
        passed: false,
        checks: [
          {
            name: "merge conflict markers",
            status: "FAIL",
            value: 2,
            allowed: "<= 0",
            offenders: [
              { path: "src/z.ts", count: 1 },
              { path: "src/a.ts", count: 1 },
            ],
          },
        ],
      },
      (reportPath) => {
        const result = runSummary(reportPath);
        assertEq(result.status, 1, `Expected exit 1, got ${result.status}`);
        const err = result.stderr || "";
        assert(
          err.includes("sorted by path ascending"),
          "Expected offender path ordering validation error"
        );
      }
    );
  });

  await runTest("fails when fail check omits offender rows", async () => {
    withTempReport(
      {
        schemaVersion: 1,
        root: "/tmp/example",
        passed: false,
        checks: [
          {
            name: "merge conflict markers",
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
          err.includes("must include offenders when FAIL"),
          "Expected FAIL-without-offenders validation error"
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
