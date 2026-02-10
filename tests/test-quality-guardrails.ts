#!/usr/bin/env bun
/**
 * Wiring tests for quality guardrail script.
 *
 * Why:
 * Ensures guardrail command remains runnable and keeps checking the expected
 * policy categories as the script evolves.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

const runQualityCheck = (qualityRoot?: string) =>
  spawnSync("bun", ["run", "scripts/check-quality-guardrails.ts"], {
    cwd: process.cwd(),
    encoding: "utf-8",
    stdio: "pipe",
    env: {
      ...process.env,
      ...(qualityRoot ? { QUALITY_GUARDRAILS_ROOT: qualityRoot } : {}),
    },
  });

const runQualityCheckJson = (qualityRoot?: string) =>
  spawnSync("bun", ["run", "scripts/check-quality-guardrails.ts", "--json"], {
    cwd: process.cwd(),
    encoding: "utf-8",
    stdio: "pipe",
    env: {
      ...process.env,
      ...(qualityRoot ? { QUALITY_GUARDRAILS_ROOT: qualityRoot } : {}),
    },
  });

const runQualitySummary = (reportPath: string) =>
  spawnSync("bun", ["run", "scripts/quality-report-summary.ts", reportPath], {
    cwd: process.cwd(),
    encoding: "utf-8",
    stdio: "pipe",
    env: {
      ...process.env,
    },
  });

const withTempQualityRoot = (setup: (root: string) => void): string => {
  const root = mkdtempSync(join(tmpdir(), "ryos-quality-guardrails-"));
  setup(root);
  return root;
};

const writeFileWithLineCount = (
  filePath: string,
  lineCount: number,
  linePrefix: string
) => {
  const contents = Array.from(
    { length: lineCount },
    (_, index) => `${linePrefix} ${index}\n`
  ).join("");
  writeFileSync(filePath, contents, "utf-8");
};

export async function runQualityGuardrailTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Quality Guardrail Wiring Tests"));

  console.log(section("Command execution"));
  await runTest("quality:check command exits successfully", async () => {
    const result = runQualityCheck();

    assertEq(result.status, 0, `Expected exit code 0, got ${result.status}`);
    assert(
      (result.stdout || "").includes("Quality guardrails check"),
      "Expected quality guardrails header in stdout"
    );
  });

  await runTest("quality:check supports JSON output mode", async () => {
    const result = runQualityCheckJson();
    assertEq(result.status, 0, `Expected exit code 0, got ${result.status}`);
    const parsed = JSON.parse(result.stdout || "{}") as {
      schemaVersion?: number;
      passed?: boolean;
      totalChecks?: number;
      failedChecks?: number;
      checks?: Array<{ name: string }>;
    };
    assert(parsed.schemaVersion === 1, "Expected schemaVersion=1 in JSON output");
    assert(parsed.passed === true, "Expected JSON output to mark passed=true");
    assert(Array.isArray(parsed.checks), "Expected checks array in JSON output");
    assert(
      typeof parsed.totalChecks === "number" &&
        parsed.totalChecks === (parsed.checks || []).length,
      "Expected totalChecks metadata to match checks length"
    );
    assert(
      parsed.failedChecks === 0,
      "Expected failedChecks metadata to be zero for passing run"
    );
    const checkNames = new Set((parsed.checks || []).map((check) => check.name));
    const requiredCheckNames = [
      "eslint-disable comments",
      "debugger statements",
      "merge conflict markers",
      "very large TypeScript files",
      "large TypeScript files",
    ];
    for (const checkName of requiredCheckNames) {
      assert(
        checkNames.has(checkName),
        `Expected ${checkName} guardrail in JSON checks`
      );
    }
  });

  await runTest("quality:check JSON check ordering is deterministic", async () => {
    const first = runQualityCheckJson();
    const second = runQualityCheckJson();
    assertEq(first.status, 0, "Expected first JSON run to pass");
    assertEq(second.status, 0, "Expected second JSON run to pass");

    const firstParsed = JSON.parse(first.stdout || "{}") as {
      checks?: Array<{ name: string; status: string; value: number }>;
      totalChecks?: number;
      failedChecks?: number;
    };
    const secondParsed = JSON.parse(second.stdout || "{}") as {
      checks?: Array<{ name: string; status: string; value: number }>;
      totalChecks?: number;
      failedChecks?: number;
    };

    const firstChecks = firstParsed.checks || [];
    const secondChecks = secondParsed.checks || [];
    assertEq(
      firstChecks.length,
      secondChecks.length,
      "Expected equal check counts between repeated JSON runs"
    );
    for (let index = 0; index < firstChecks.length; index++) {
      const a = firstChecks[index];
      const b = secondChecks[index];
      assert(
        a.name === b.name && a.status === b.status && a.value === b.value,
        `Expected deterministic check ordering/value at index ${index}`
      );
    }
    assertEq(
      firstParsed.totalChecks,
      secondParsed.totalChecks,
      "Expected deterministic totalChecks metadata"
    );
    assertEq(
      firstParsed.failedChecks,
      secondParsed.failedChecks,
      "Expected deterministic failedChecks metadata"
    );
  });

  await runTest("quality:summary renders markdown from JSON report", async () => {
    const jsonResult = runQualityCheckJson();
    assertEq(jsonResult.status, 0, "Expected JSON report command to pass");

    const tmpDir = mkdtempSync(join(tmpdir(), "ryos-quality-summary-"));
    const reportPath = join(tmpDir, "quality-report.json");
    writeFileSync(reportPath, jsonResult.stdout || "{}", "utf-8");

    try {
      const summaryResult = runQualitySummary(reportPath);
      assertEq(summaryResult.status, 0, "Expected summary command to pass");
      const out = summaryResult.stdout || "";
      assert(
        out.includes("## Quality Guardrails Report"),
        "Expected markdown heading in summary output"
      );
      assert(
        out.includes("| Check | Status | Value | Allowed |"),
        "Expected markdown table header in summary output"
      );
      assert(out.includes("- Total checks:"), "Expected total checks summary line");
      assert(out.includes("- Failed checks:"), "Expected failed checks summary line");
      assert(
        out.includes("eslint-disable comments"),
        "Expected known guardrail row in summary output"
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  console.log(section("Guardrail categories"));
  await runTest("reports suppression and command safety checks", async () => {
    const result = runQualityCheck();

    const out = result.stdout || "";
    assert(out.includes("eslint-disable comments"), "Missing eslint-disable guardrail");
    assert(
      out.includes("@ts-ignore/@ts-expect-error"),
      "Missing ts-ignore guardrail"
    );
    assert(out.includes("@ts-nocheck comments"), "Missing ts-nocheck guardrail");
    assert(out.includes("innerHTML assignments"), "Missing innerHTML guardrail");
    assert(out.includes("execSync usage in scripts"), "Missing execSync guardrail");
    assert(
      out.includes("child_process exec import usage in scripts"),
      "Missing child_process exec import guardrail"
    );
    assert(out.includes("shell:true command execution"), "Missing shell:true guardrail");
    assert(out.includes("TODO/FIXME/HACK markers"), "Missing task marker guardrail");
    assert(
      out.includes("dynamic code execution (eval/new Function)"),
      "Missing dynamic code execution guardrail"
    );
    assert(out.includes("debugger statements"), "Missing debugger guardrail");
    assert(out.includes("merge conflict markers"), "Missing merge marker guardrail");
  });

  await runTest("reports maintainability and HTML allowlist checks", async () => {
    const result = runQualityCheck();

    const out = result.stdout || "";
    assert(
      out.includes("very large TypeScript files"),
      "Missing 1000+ LOC file-size guardrail"
    );
    assert(out.includes("large TypeScript files"), "Missing file-size guardrail");
    assert(
      out.includes("dangerouslySetInnerHTML usage"),
      "Missing dangerouslySetInnerHTML allowlist guardrail"
    );
    assert(
      out.includes("biome exhaustive-deps bypass comments"),
      "Missing biome exhaustive-deps bypass allowlist guardrail"
    );
  });

  console.log(section("Failure behavior"));
  await runTest("fails when disallowed eslint-disable appears in source", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "Bad.ts"),
        `// eslint-disable-next-line no-console\nconsole.log("x");\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for bad source, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL eslint-disable comments"),
        "Expected eslint-disable guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when disallowed eslint-disable appears in scripts", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(
        join(root, "scripts", "BadScript.ts"),
        `// eslint-disable-next-line no-console\nconsole.log("x");\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for bad script, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL eslint-disable comments"),
        "Expected eslint-disable guardrail failure for scripts"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest(
    "fails when dangerouslySetInnerHTML is used outside allowlist",
    async () => {
      const qualityRoot = withTempQualityRoot((root) => {
        mkdirSync(join(root, "src"), { recursive: true });
        writeFileSync(
          join(root, "src", "Bad.tsx"),
          `export function Bad(){return <div dangerouslySetInnerHTML={{__html:"<b>x</b>"}} />}\n`,
          "utf-8"
        );
      });

      try {
        const result = runQualityCheck(qualityRoot);
        assertEq(
          result.status,
          1,
          `Expected failure exit code 1 for disallowed HTML usage, got ${result.status}`
        );
        assert(
          (result.stdout || "").includes("FAIL dangerouslySetInnerHTML usage"),
          "Expected dangerouslySetInnerHTML allowlist guardrail failure"
        );
      } finally {
        rmSync(qualityRoot, { recursive: true, force: true });
      }
    }
  );

  await runTest("fails when shell:true is introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(
        join(root, "scripts", "Bad.ts"),
        `const opts = { shell: true };\nconsole.log(opts);\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for shell:true usage, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL shell:true command execution"),
        "Expected shell:true guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when execSync usage is introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(
        join(root, "scripts", "BadExec.ts"),
        `import { execSync } from "node:child_process";\nexecSync("echo hi");\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for execSync usage, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL execSync usage in scripts"),
        "Expected execSync guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when execSync usage is introduced in JavaScript scripts", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(
        join(root, "scripts", "BadExec.js"),
        `import { execSync } from "node:child_process";\nexecSync("echo hi");\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for execSync in js script, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL execSync usage in scripts"),
        "Expected execSync guardrail failure for js scripts"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when child_process exec import is introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(
        join(root, "scripts", "BadExecImport.ts"),
        `import { exec } from "node:child_process";\nconsole.log(exec);\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for exec import usage, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes(
          "FAIL child_process exec import usage in scripts"
        ),
        "Expected child_process exec import guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when @ts-nocheck is introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "NoCheck.ts"),
        `// @ts-nocheck\nexport const value = 1;\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for @ts-nocheck usage, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL @ts-nocheck comments"),
        "Expected @ts-nocheck guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when @ts-expect-error is introduced in scripts", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(
        join(root, "scripts", "BadTypeSuppression.ts"),
        `// @ts-expect-error intentional test\nexport const value: number = "x";\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for @ts-expect-error in scripts, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL @ts-ignore/@ts-expect-error"),
        "Expected ts-ignore/expect-error guardrail failure for scripts"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when TODO markers are introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "Todo.ts"),
        `// TODO: remove this temporary branch\nexport const value = 1;\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for TODO marker, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL TODO/FIXME/HACK markers"),
        "Expected TODO/FIXME/HACK guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when eval is introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "BadEval.ts"),
        `export const run = (value: string) => eval(value);\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for eval usage, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes(
          "FAIL dynamic code execution (eval/new Function)"
        ),
        "Expected dynamic code execution guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when debugger statement is introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "BadDebugger.ts"),
        `export const run = () => { debugger; return true; };\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for debugger usage, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL debugger statements"),
        "Expected debugger guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when merge conflict markers are introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "MergeConflict.ts"),
        [
          "export const value = 1;",
          "<<<<<<< HEAD",
          "export const a = 1;",
          "=======",
          "export const a = 2;",
          ">>>>>>> feature-branch",
          "",
        ].join("\n"),
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for merge markers, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL merge conflict markers"),
        "Expected merge conflict marker guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("JSON mode returns failure status for violations", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "Todo.ts"),
        `// TODO: should fail in JSON mode\nexport const value = 1;\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheckJson(qualityRoot);
      assertEq(result.status, 1, "Expected JSON mode to return exit code 1");
      const parsed = JSON.parse(result.stdout || "{}") as {
        schemaVersion?: number;
        passed?: boolean;
        failedChecks?: number;
        checks?: Array<{ name: string; status: string }>;
      };
      assert(parsed.schemaVersion === 1, "Expected schemaVersion=1 in JSON failure output");
      assert(parsed.passed === false, "Expected passed=false in JSON failure output");
      assert(
        typeof parsed.failedChecks === "number" && parsed.failedChecks > 0,
        "Expected failedChecks metadata for failing JSON output"
      );
      assert(
        (parsed.checks || []).some(
          (check) =>
            check.name === "TODO/FIXME/HACK markers" && check.status === "FAIL"
        ),
        "Expected TODO guardrail failure entry in JSON output"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("JSON mode exposes offender entries as {path,count}", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "Todo.ts"),
        `// TODO: should fail schema check\nexport const value = 1;\n`,
        "utf-8"
      );
      // Add enough large files to trigger a size guardrail and validate shared offender shape.
      for (let i = 0; i < 30; i++) {
        writeFileWithLineCount(
          join(root, "src", `HugeSchema${i}.ts`),
          1001,
          "export const z = 1;"
        );
      }
    });

    try {
      const result = runQualityCheckJson(qualityRoot);
      assertEq(result.status, 1, "Expected JSON mode to fail for violations");
      const parsed = JSON.parse(result.stdout || "{}") as {
        checks?: Array<{
          name: string;
          status: "PASS" | "FAIL";
          offenders?: Array<{ path: unknown; count: unknown }>;
        }>;
      };
      const failedChecks = (parsed.checks || []).filter(
        (check) => check.status === "FAIL"
      );
      assert(failedChecks.length >= 2, "Expected at least two failing checks");

      for (const check of failedChecks) {
        const offenders = check.offenders || [];
        assert(offenders.length > 0, `Expected offenders for failed check: ${check.name}`);
        for (const offender of offenders) {
          assert(
            typeof offender.path === "string" && offender.path.length > 0,
            `Expected offender.path string for check ${check.name}`
          );
          assert(
            typeof offender.count === "number" && offender.count > 0,
            `Expected offender.count number for check ${check.name}`
          );
        }
      }
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest(
    "fails when biome exhaustive-deps bypass appears outside allowlist",
    async () => {
      const qualityRoot = withTempQualityRoot((root) => {
        mkdirSync(join(root, "src"), { recursive: true });
        writeFileSync(
          join(root, "src", "BadBypass.ts"),
          `// biome-ignore lint/correctness/useExhaustiveDependencies: test\nexport const y = 1;\n`,
          "utf-8"
        );
      });

      try {
        const result = runQualityCheck(qualityRoot);
        assertEq(
          result.status,
          1,
          `Expected failure exit code 1 for disallowed biome bypass comment, got ${result.status}`
        );
        assert(
          (result.stdout || "").includes(
            "FAIL biome exhaustive-deps bypass comments"
          ),
          "Expected biome exhaustive-deps bypass guardrail failure"
        );
      } finally {
        rmSync(qualityRoot, { recursive: true, force: true });
      }
    }
  );

  await runTest("fails when large file guardrail is exceeded", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      // Exceed maxFilesOverThreshold (14) with 15 files at 1501 LOC each.
      for (let i = 0; i < 15; i++) {
        writeFileWithLineCount(
          join(root, "src", `Big${i}.ts`),
          1501,
          "export const x = 1;"
        );
      }
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for large file count, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL large TypeScript files"),
        "Expected large TypeScript files guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when very-large file guardrail is exceeded", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      // Exceed maxFilesOverThreshold (29) with 30 files at 1001 LOC each.
      for (let i = 0; i < 30; i++) {
        writeFileWithLineCount(
          join(root, "src", `Huge${i}.ts`),
          1001,
          "export const y = 1;"
        );
      }
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for very-large file count, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL very large TypeScript files"),
        "Expected very large TypeScript files guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("reports offending files in deterministic order", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "z-last.ts"),
        `// TODO: z\nexport const z = 1;\n`,
        "utf-8"
      );
      writeFileSync(
        join(root, "src", "a-first.ts"),
        `// TODO: a\nexport const a = 1;\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(result.status, 1, "Expected failure for TODO markers");
      const out = result.stdout || "";
      const firstIdx = out.indexOf("src/a-first.ts");
      const secondIdx = out.indexOf("src/z-last.ts");
      assert(firstIdx !== -1, "Expected first offending path in output");
      assert(secondIdx !== -1, "Expected second offending path in output");
      assert(
        firstIdx < secondIdx,
        "Expected offending files to be reported in stable sorted order"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest(
    "reports very-large file offenders in deterministic tie-break order",
    async () => {
      const qualityRoot = withTempQualityRoot((root) => {
        mkdirSync(join(root, "src"), { recursive: true });
        // Trigger the 1500+ LOC threshold with equal line counts.
        for (let i = 0; i < 13; i++) {
          writeFileWithLineCount(
            join(root, "src", `m-mid-${i}.ts`),
            1501,
            "export const q = 1;"
          );
        }
        writeFileWithLineCount(
          join(root, "src", "z-last.ts"),
          1501,
          "export const z = 1;"
        );
        writeFileWithLineCount(
          join(root, "src", "a-first.ts"),
          1501,
          "export const a = 1;"
        );
      });

      try {
        const result = runQualityCheck(qualityRoot);
        assertEq(result.status, 1, "Expected failure for large-file threshold");
        const out = result.stdout || "";
        const firstIdx = out.indexOf("src/a-first.ts");
        const secondIdx = out.indexOf("src/z-last.ts");
        assert(firstIdx !== -1, "Expected alphabetical first offender path in output");
        assert(secondIdx !== -1, "Expected alphabetical last offender path in output");
        assert(
          firstIdx < secondIdx,
          "Expected deterministic alphabetical tie-break ordering for equal LOC offenders"
        );
      } finally {
        rmSync(qualityRoot, { recursive: true, force: true });
      }
    }
  );

  return printSummary();
}

if (import.meta.main) {
  runQualityGuardrailTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
